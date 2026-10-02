#!/usr/bin/env bash
# Prune versioned release artefacts from the R2 mirror (see CLAUDE.md, "R2 Retention Policy").
#
# Usage:
#   scripts/r2-prune.sh                      dry run: list the bucket prefix, print the
#                                            prune candidates, delete nothing
#   scripts/r2-prune.sh --apply              list, print the candidates, then delete them
#   scripts/r2-prune.sh --list-file <xml>    offline: read a saved ListObjectsV2 response
#                                            instead of calling the API (no network, no
#                                            credentials; cannot be combined with --apply)
#   scripts/r2-prune.sh --list-file <xml> --today <YYYY-MM-DD>
#                                            offline only: fix the reference date (tests)
#
# Credentials (online mode) are read from the environment and never from a file:
#   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY   S3-compatible key pair for the bucket
#   CLOUDFLARE_ACCOUNT_ID                    account that owns the bucket (32 hex chars)
# RELEASE_RUNBOOK.md, "Maintainer credentials", shows how to supply them.
#
# A prune candidate must satisfy ALL of:
#   - key is exactly  yggdrasil-mcp/yggdrasil-mcp-<semver>.(mcpb|zip)  or that plus .sha256
#   - name contains neither "latest" nor "SHA256SUMS"
#   - <semver> is not the version in package.json
#   - LastModified (UTC date) is earlier than the cutoff, today (UTC) minus 90 days
# Everything else under the prefix (install.html, pointers, checksum aggregates, anything
# hand-uploaded) is never a candidate.
#
# The script refuses to select anything when the listing is truncated (more than one page),
# is not a ListObjectsV2 result, has an object with an unreadable LastModified, or holds no
# artefact for the package.json version (wrong checkout, or a version bumped but not yet
# released: the "always keep the latest" anchor would be wrong).
#
# Exit codes: 0 success, 1 runtime failure (listing or delete), 2 usage or environment error.
# Requires: bash, python3 and, online, curl 7.75 or newer (--aws-sigv4).
set -euo pipefail

readonly BUCKET="packages"
readonly PREFIX="yggdrasil-mcp/"
readonly RETENTION_DAYS=90

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly ROOT

usage_error() {
  echo "r2-prune: $1" >&2
  echo "usage: scripts/r2-prune.sh [--apply] | [--list-file <xml> [--today <YYYY-MM-DD>]]" >&2
  exit 2
}

APPLY=0
LIST_FILE=""
TODAY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --apply)
      APPLY=1
      shift
      ;;
    --list-file)
      [ $# -ge 2 ] || usage_error "--list-file needs a path"
      LIST_FILE="$2"
      shift 2
      ;;
    --today)
      [ $# -ge 2 ] || usage_error "--today needs a date"
      TODAY="$2"
      shift 2
      ;;
    -h | --help)
      sed -n '2,/^set -euo pipefail$/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      usage_error "unknown argument: $1"
      ;;
  esac
done

if [ -n "$LIST_FILE" ] && [ "$APPLY" -eq 1 ]; then
  usage_error "--apply cannot be combined with --list-file: an offline listing is never deleted from"
fi
if [ -n "$TODAY" ] && [ -z "$LIST_FILE" ]; then
  usage_error "--today is only accepted together with --list-file"
fi
if [ -n "$LIST_FILE" ] && [ ! -r "$LIST_FILE" ]; then
  usage_error "cannot read list file: $LIST_FILE"
fi
command -v python3 >/dev/null 2>&1 || usage_error "python3 is required"

# ---------------------------------------------------------------------------------------
# Selection. One implementation, three output modes, so the dry run, the delete loop and
# the tests all see the same candidates.
#   select_objects <mode> <xml-file>     mode: all | report | keys
# ---------------------------------------------------------------------------------------
select_objects() {
  python3 - "$1" "$2" "$ROOT/package.json" "$PREFIX" "$RETENTION_DAYS" "$TODAY" <<'PY'
import datetime
import json
import re
import sys
import xml.etree.ElementTree as ET

mode, xml_path, package_json, prefix, retention_days, today_arg = sys.argv[1:7]
NS = "http://s3.amazonaws.com/doc/2006-03-01/"
SEMVER = r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?"


def fail(message):
    sys.exit(f"r2-prune: {message}")


def tag(name):
    return f"{{{NS}}}{name}"


with open(package_json, encoding="utf-8") as handle:
    current = json.load(handle).get("version", "")
if not re.fullmatch(SEMVER, current):
    fail("package.json has no usable version; refusing to select anything")

if today_arg:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", today_arg):
        fail("--today must be YYYY-MM-DD")
    try:
        today = datetime.date.fromisoformat(today_arg)
    except ValueError:
        fail("--today is not a valid date")
else:
    today = datetime.datetime.now(datetime.timezone.utc).date()
cutoff = (today - datetime.timedelta(days=int(retention_days))).isoformat()

try:
    root = ET.parse(xml_path).getroot()
except (ET.ParseError, OSError) as error:
    fail(f"listing is not readable XML ({error.__class__.__name__}); refusing to select anything")

if root.tag != tag("ListBucketResult"):
    code = root.findtext("Code") or root.findtext(tag("Code")) or "unknown"
    message = root.findtext("Message") or root.findtext(tag("Message")) or "no message"
    fail(f"listing is not a ListObjectsV2 result (root <{root.tag.rsplit('}', 1)[-1]}>, {code}: {message})")
truncated = (root.findtext(tag("IsTruncated")) or "").strip().lower()
if truncated != "false":
    fail(
        "listing is truncated or does not say whether it is complete; "
        "refusing to prune from a partial list"
    )

artefact = re.compile(
    re.escape(prefix) + r"yggdrasil-mcp-(?P<version>" + SEMVER + r")\.(?:mcpb|zip)(?:\.sha256)?"
)
objects = []
for element in root.findall(tag("Contents")):
    key = element.findtext(tag("Key")) or ""
    modified = element.findtext(tag("LastModified")) or ""
    size = element.findtext(tag("Size")) or "?"
    if not key:
        fail("listing has an object without a key; refusing to select anything")
    if not re.match(r"\d{4}-\d{2}-\d{2}T", modified):
        fail(f"object {key} has an unreadable LastModified; refusing to select anything")
    objects.append((key, modified[:10], size))

candidates = []
current_present = False
for key, modified, _size in objects:
    name = key.rsplit("/", 1)[-1]
    if "latest" in name or "SHA256SUMS" in name:
        continue
    match = artefact.fullmatch(key)
    if match is None:
        continue
    if match.group("version") == current:
        current_present = True
        continue
    if modified >= cutoff:
        continue
    candidates.append((key, modified))

if not current_present:
    fail(
        f"no artefact for the package.json version ({current}) under {prefix}: "
        "run this from the checkout of the latest released version"
    )

if mode == "all":
    print(f"Current version (always kept): {current}")
    print(f"Cutoff (UTC): {cutoff}; a versioned artefact uploaded before this date is a candidate")
    print(f"=== Objects under {prefix} ({len(objects)}) ===")
    for key, modified, size in objects:
        print(f"  {modified}  {size:>10}  {key}")
elif mode == "report":
    print(f"=== Prune candidates ({len(candidates)}) ===")
    for key, modified in candidates:
        print(f"  PRUNE: {key}  (uploaded {modified})")
elif mode == "keys":
    for key, _modified in candidates:
        print(key)
else:
    fail(f"unknown mode {mode}")
PY
}

# ---------------------------------------------------------------------------------------
# Offline mode: selection only.
# ---------------------------------------------------------------------------------------
if [ -n "$LIST_FILE" ]; then
  select_objects all "$LIST_FILE"
  select_objects report "$LIST_FILE"
  echo "OFFLINE: selection from a saved listing. Nothing was requested or deleted."
  exit 0
fi

# ---------------------------------------------------------------------------------------
# Online mode.
# ---------------------------------------------------------------------------------------
missing=""
for name in R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY CLOUDFLARE_ACCOUNT_ID; do
  [ -n "${!name:-}" ] || missing="$missing $name"
done
if [ -n "$missing" ]; then
  echo "r2-prune: missing environment variable(s):$missing" >&2
  echo "          see RELEASE_RUNBOOK.md, \"Maintainer credentials\"" >&2
  exit 2
fi
# Values are checked for shape and never echoed. The account ID becomes part of the request
# host name, so anything other than 32 hex characters is rejected before a request is signed.
if ! [[ "$CLOUDFLARE_ACCOUNT_ID" =~ ^[0-9a-f]{32}$ ]]; then
  echo "r2-prune: CLOUDFLARE_ACCOUNT_ID is not 32 lowercase hexadecimal characters" >&2
  exit 2
fi
for name in R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
  if ! [[ "${!name}" =~ ^[A-Za-z0-9+/=_-]+$ ]]; then
    echo "r2-prune: $name contains unexpected characters (is it an unresolved reference?)" >&2
    exit 2
  fi
done
command -v curl >/dev/null 2>&1 || usage_error "curl is required"

readonly S3_ENDPOINT="https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/r2-prune.XXXXXX")"
readonly WORK_DIR
trap 'rm -rf "$WORK_DIR"' EXIT

# The key pair reaches curl on stdin (--config -), so it is in no argument list and in no file.
r2_curl() {
  printf 'user = "%s:%s"\n' "$R2_ACCESS_KEY_ID" "$R2_SECRET_ACCESS_KEY" |
    curl --config - -sS --connect-timeout 15 --max-time 120 --aws-sigv4 "aws:amz:auto:s3" "$@"
}

# fetch_listing <output-file>: one ListObjectsV2 page for the prefix; HTTP 200 required.
fetch_listing() {
  local code
  if ! code="$(r2_curl -o "$1" -w '%{http_code}' "${S3_ENDPOINT}/${BUCKET}/?list-type=2&prefix=${PREFIX}")"; then
    echo "r2-prune: listing request failed (curl error above)" >&2
    exit 1
  fi
  if [ "$code" != "200" ]; then
    echo "r2-prune: listing returned HTTP $code, expected 200" >&2
    exit 1
  fi
}

LISTING="$WORK_DIR/listing.xml"
fetch_listing "$LISTING"

# Selection runs to completion (and can refuse) before anything is deleted.
select_objects all "$LISTING"
select_objects report "$LISTING"
KEYS="$(select_objects keys "$LISTING")"

if [ "$APPLY" -ne 1 ]; then
  echo "DRY RUN: nothing deleted. Re-run with --apply to delete the candidates above."
  exit 0
fi

if [ -z "$KEYS" ]; then
  echo "Nothing to delete."
  exit 0
fi

deleted=0
while IFS= read -r key; do
  [ -n "$key" ] || continue
  if ! code="$(r2_curl -o /dev/null -w '%{http_code}' -X DELETE "${S3_ENDPOINT}/${BUCKET}/${key}")"; then
    echo "r2-prune: DELETE request failed for ${key} (curl error above); stopped after ${deleted} delete(s)" >&2
    exit 1
  fi
  if [ "$code" != "204" ]; then
    echo "r2-prune: DELETE returned HTTP $code for ${key}, expected 204; stopped after ${deleted} delete(s)" >&2
    exit 1
  fi
  deleted=$((deleted + 1))
  echo "deleted ${key}"
done <<<"$KEYS"

echo "Deleted ${deleted} object(s). Listing the prefix again:"
AFTER="$WORK_DIR/after.xml"
fetch_listing "$AFTER"
select_objects all "$AFTER"
REMAINING="$(select_objects keys "$AFTER")"
if [ -n "$REMAINING" ]; then
  echo "r2-prune: candidates are still listed after the deletes:" >&2
  echo "$REMAINING" >&2
  exit 1
fi
echo "No prune candidates remain."
