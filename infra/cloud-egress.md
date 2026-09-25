# Cloud-level egress controls (belt and braces)

The host firewall (`nftables.conf`) is the primary egress control, but a
compromised root on the sensor could flush it. So enforce the same policy
**outside the box**, at the cloud network layer, where the sensor's root
cannot reach. Apply both; they are independent.

## The rule, in words

- **Inbound:** allow `22` and `23` from anywhere (the bait); allow your
  real admin SSH port (22022) from your IP only; drop everything else.
- **Outbound:** allow only → the fixed ingest host on 443 (telemetry), your DNS
  resolver, your NTP server, and — **only during provisioning** — package
  mirrors. Drop everything else, and log it. Do **not** leave port 53 open to
  the whole internet: an open resolver path is a working DNS-tunnelling exfil
  channel. Pin DNS (and NTP) to a single address.

The ingest tier uses a stable public IPv4 address, so the telemetry rule is a
single `/32`, not a provider edge range. See `docs/SECURITY.md` S1 for the
small residual risk of other HTTPS virtual hosts on that same address.
Set `INGEST_IPV4` and `INGEST_HOSTNAME` to your own endpoint before running
the commands below, and use the same address in `nftables.conf`.

## Hetzner Cloud Firewall

Hetzner Cloud Firewalls attach to the server and are enforced by the
platform, so they survive root on the box — exactly the property we want.
Note the semantics: **defining any outbound rule switches outbound to
default-deny**, so the list below is complete, not additive.

Create it in the Hetzner Console (Firewalls → Create) or with `hcloud`:

```sh
hcloud firewall create --name hunang-sensor-fw

# ── inbound ──────────────────────────────────────────────────────────────
# The bait: the whole internet may reach 22 and 23.
hcloud firewall add-rule hunang-sensor-fw --direction in --protocol tcp \
  --port 22 --source-ips 0.0.0.0/0 --source-ips ::/0
hcloud firewall add-rule hunang-sensor-fw --direction in --protocol tcp \
  --port 23 --source-ips 0.0.0.0/0 --source-ips ::/0
# Real admin SSH: your address only.
hcloud firewall add-rule hunang-sensor-fw --direction in --protocol tcp \
  --port 22022 --source-ips "$ADMIN_CIDR"
hcloud firewall add-rule hunang-sensor-fw --direction in --protocol icmp \
  --source-ips 0.0.0.0/0 --source-ips ::/0

# ── outbound (defining these makes outbound default-deny) ────────────────
# Telemetry: HTTPS to the fixed ingest host only.
hcloud firewall add-rule hunang-sensor-fw --direction out --protocol tcp \
  --port 443 --destination-ips "$INGEST_IPV4/32"
# DNS: the pinned resolver(s), not the internet. Keep this list IDENTICAL to
# DNS_RESOLVER in nftables.conf — the two layers drifting apart means one of
# them is silently blocking traffic the other allows.
hcloud firewall add-rule hunang-sensor-fw --direction out --protocol udp \
  --port 53 --destination-ips 185.12.64.1/32 --destination-ips 185.12.64.2/32
hcloud firewall add-rule hunang-sensor-fw --direction out --protocol tcp \
  --port 53 --destination-ips 185.12.64.1/32 --destination-ips 185.12.64.2/32
# NTP: the time server the host ACTUALLY syncs against — check with
# `timedatectl show -p NTP` and resolve that name; do not reuse the DNS
# resolver's address here (that mistake silently drops all time sync, and
# event timestamps are load-bearing). Keep identical to NTP_SERVER in
# nftables.conf. ntp.hetzner.com:
hcloud firewall add-rule hunang-sensor-fw --direction out --protocol udp \
  --port 123 --destination-ips 213.239.239.164/32 \
  --destination-ips 213.239.239.165/32 --destination-ips 213.239.239.166/32

hcloud firewall apply-to-resource hunang-sensor-fw --type server --server hunang
```

**During provisioning only**, add a temporary outbound `tcp/443` and
`tcp/80` to `0.0.0.0/0` so apt and image pulls work. Remove both before
Cowrie starts, then re-run the verification below.

Confirm the telemetry hostname still resolves to the allowed address before
trusting it. If it changes, telemetry fails closed and the shipper logs
connection errors:

```sh
dig +short "$INGEST_HOSTNAME"
```

## Isolation on Hetzner

Hetzner has no equivalent of an AWS account boundary or a GCP project-level
VPC perimeter, so isolation is achieved by keeping the sensor **alone in its
own Hetzner project**, with **no private network attached** and no other
resources in that project. There is then nothing on the inside to pivot to:
the only reachable peer is the public internet, which the egress rules above
already close off.

## Verifying the lockdown

After applying the rules, run these **both on the host and inside a
container** — Cowrie and the shipper run in Docker, whose traffic traverses
the `forward` chain rather than `output`, so a host-only test proves nothing
about them:

```sh
# on the host
curl -m 5 https://example.com            # must FAIL (no general egress)
nc -vz -w3 1.1.1.1 22                    # must FAIL
dig +time=3 example.com @8.8.8.8         # must FAIL (DNS pinned to your resolver)
curl -m 5 "https://$INGEST_HOSTNAME/healthz"   # must SUCCEED (telemetry only)

# and from inside a container, which is what actually ships telemetry
docker run --rm curlimages/curl:latest -m 5 https://example.com          # must FAIL
docker run --rm curlimages/curl:latest -m 5 \
  "https://$INGEST_HOSTNAME/healthz"                         # must SUCCEED
```

If any "must FAIL" line succeeds, **do not start Cowrie** — the egress
policy is not in force.

Note that `nftables.conf` begins with `flush ruleset`, which also clears the
rules Docker manages for itself. Always `systemctl restart docker` after
loading it, or containers will have no working network at all.
