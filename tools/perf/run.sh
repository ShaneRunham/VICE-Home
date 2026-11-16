#!/usr/bin/env bash
# TV frame test: install the TEST build, then for each CSS variant relaunch Vice Home and drive a fixed key route.
set -u
D=$(dirname "$(readlink -f "$0")"); T=~/tv-launcher/tools  # needs test.ipk here: ~/couch-tv/.venv/bin/python build-test.py ~/tv-launcher/vice, then copy ~/couch-tv/build/lg/*.ipk to test.ipk
K=(-i "$HOME/.ssh/lgtv_ed25519" -o BatchMode=yes -o IdentitiesOnly=yes -o LogLevel=ERROR -o ExitOnForwardFailure=yes root@192.168.0.108)
setsid python3 "$D/logger.py" & LOGGER=$!
setsid ssh -N -R 5409:127.0.0.1:5409 "${K[@]}" & TUN=$!
trap 'kill $LOGGER $TUN 2>/dev/null' EXIT
sleep 2
if [ "${SKIP_INSTALL:-}" != 1 ]; then
  ssh "${K[@]}" 'cat > /tmp/x.ipk' < "$D/test.ipk"
  ssh -tt "${K[@]}" 'luna-send -n 60 -w 180000 -i luna://com.webos.appInstallService/dev/install "{\"id\":\"app.couchtv.home\",\"ipkUrl\":\"/tmp/x.ipk\",\"subscribe\":true}" | grep -o "\"state\":\"[a-z ]*\"" | tail -1; rm -f /tmp/x.ipk'
fi
route() {
  $T/tvkey back back back down  right right right left left left  down right right left  down right left  down right left  up up up \
    up right; sleep 0.8; $T/tvkey down right right down down down up up up  back back back down
}
for round in 1 2; do
  IFS=, read -ra VS <<< "${VARIANTS:-,nomask,lay,nomask lay,xfade}"; for v in "${VS[@]}"; do
    echo "$v" > "$D/variant.txt"; echo "round $round variant [${v:-base}]"
    $T/tvopen app.couchtv.home >/dev/null; sleep 4
    echo "{\"t\": $(date +%s.%N), \"kind\": \"start\", \"body\": \"$v\"}" >> "$D/log.jsonl"
    route
  done
done
