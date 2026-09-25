/**
 * Mapping from observed honeypot behavior to MITRE ATT&CK techniques.
 *
 * Deliberately conservative: we only claim a technique when the observed
 * event is direct evidence of it. The mapping is a data table so it can
 * be reviewed, tested, and extended without touching aggregation logic.
 */

export interface Technique {
  id: string;
  name: string;
  tactic: string;
}

export const TECHNIQUES = {
  T1110_001: { id: "T1110.001", name: "Brute Force: Password Guessing", tactic: "Credential Access" },
  T1078_001: { id: "T1078.001", name: "Valid Accounts: Default Accounts", tactic: "Initial Access" },
  T1021_004: { id: "T1021.004", name: "Remote Services: SSH", tactic: "Lateral Movement" },
  T1021: { id: "T1021", name: "Remote Services (Telnet)", tactic: "Lateral Movement" },
  T1059_004: { id: "T1059.004", name: "Command and Scripting Interpreter: Unix Shell", tactic: "Execution" },
  T1105: { id: "T1105", name: "Ingress Tool Transfer", tactic: "Command and Control" },
  T1082: { id: "T1082", name: "System Information Discovery", tactic: "Discovery" },
  T1016: { id: "T1016", name: "System Network Configuration Discovery", tactic: "Discovery" },
  T1057: { id: "T1057", name: "Process Discovery", tactic: "Discovery" },
  T1003_008: { id: "T1003.008", name: "OS Credential Dumping: /etc/passwd and /etc/shadow", tactic: "Credential Access" },
  T1070: { id: "T1070", name: "Indicator Removal", tactic: "Defense Evasion" },
  T1098_004: { id: "T1098.004", name: "Account Manipulation: SSH Authorized Keys", tactic: "Persistence" },
  T1053_003: { id: "T1053.003", name: "Scheduled Task/Job: Cron", tactic: "Persistence" },
  T1222_002: { id: "T1222.002", name: "File and Directory Permissions Modification", tactic: "Defense Evasion" },
  T1496: { id: "T1496", name: "Resource Hijacking (cryptomining)", tactic: "Impact" },
} as const satisfies Record<string, Technique>;

/** Ordered rules matched against `command` events. All matches apply. */
export const COMMAND_RULES: ReadonlyArray<{ pattern: RegExp; technique: Technique }> = [
  { pattern: /\b(wget|curl|tftp|ftpget|scp)\b/i, technique: TECHNIQUES.T1105 },
  { pattern: /\bchmod\b\s+(\+[rwx]+|[0-7]*7[0-7]*)/, technique: TECHNIQUES.T1222_002 },
  { pattern: /\b(uname|whoami|id|hostname|uptime|lscpu|nproc|free|df)\b|\/proc\/cpuinfo|\/etc\/(issue|os-release)|lsb_release/, technique: TECHNIQUES.T1082 },
  { pattern: /\b(ifconfig|netstat)\b|\bip\s+(a|addr|route)\b|\bss\s+-/, technique: TECHNIQUES.T1016 },
  { pattern: /\b(ps|top|pgrep)\b/, technique: TECHNIQUES.T1057 },
  { pattern: /\/etc\/(passwd|shadow)\b/, technique: TECHNIQUES.T1003_008 },
  { pattern: /history\s+-c|rm\s+(-\w+\s+)*("?\/(var\/log|tmp\/log)|.*\.(bash_)?history)|>\s*\/var\/log/, technique: TECHNIQUES.T1070 },
  { pattern: /authorized_keys/, technique: TECHNIQUES.T1098_004 },
  { pattern: /\bcrontab\b|\/etc\/cron|\/var\/spool\/cron/, technique: TECHNIQUES.T1053_003 },
  { pattern: /\b(xmrig|minerd|kinsing|kdevtmpfsi)\b|stratum\+tcp/i, technique: TECHNIQUES.T1496 },
];

export interface ClassifiableEvent {
  type: string;
  command?: string | null;
  protocol?: string | null;
  success?: number | boolean | null;
}

/** Classify one event to zero or more techniques (deduplicated). */
export function classify(event: ClassifiableEvent): Technique[] {
  const out = new Map<string, Technique>();
  const add = (t: Technique) => out.set(t.id, t);

  switch (event.type) {
    case "session_connect":
      add(event.protocol === "telnet" ? TECHNIQUES.T1021 : TECHNIQUES.T1021_004);
      break;
    case "login_attempt":
      add(TECHNIQUES.T1110_001);
      if (event.success === 1 || event.success === true) add(TECHNIQUES.T1078_001);
      break;
    case "file_download":
      add(TECHNIQUES.T1105);
      break;
    case "command": {
      add(TECHNIQUES.T1059_004); // any input into the emulated shell
      const cmd = event.command ?? "";
      for (const rule of COMMAND_RULES) {
        if (rule.pattern.test(cmd)) add(rule.technique);
      }
      break;
    }
  }
  return [...out.values()];
}
