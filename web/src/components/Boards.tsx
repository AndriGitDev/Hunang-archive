import { formatInt, type Locale } from "@/lib/format";
import { getCopy } from "@/copy";
import type { AttckRow, CountRow, CredentialRow } from "@/lib/data";

export function CredentialBoard({
  credentials,
  locale = "en",
}: {
  credentials: CredentialRow[];
  locale?: Locale;
}) {
  const { ui } = getCopy(locale);
  const max = credentials[0]?.count ?? 1;
  return (
    <table>
      <thead>
        <tr>
          <th>{ui.credTable.rank}</th>
          <th>{ui.credTable.userPass}</th>
          <th className="num">{ui.credTable.tries}</th>
        </tr>
      </thead>
      <tbody>
        {credentials.map((c, i) => (
          <tr key={`${c.username} ${c.password}`}>
            <td className="rank">{String(i + 1).padStart(2, "0")}</td>
            <td>
              <span className="cred">
                {c.username}
                <span className="sep">/</span>
                {c.password}
              </span>
              <span
                className="countbar"
                style={{ width: `${Math.max(2, (c.count / max) * 100)}%` }}
                aria-hidden
              />
            </td>
            <td className="num">{formatInt(c.count, locale)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MiniBoard({
  title,
  rows,
  locale = "en",
}: {
  title: string;
  rows: CountRow[];
  locale?: Locale;
}) {
  return (
    <div>
      <h3 className="label" style={{ marginBottom: "0.5rem" }}>
        {title}
      </h3>
      <table>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key}>
              <td className="rank">{String(i + 1).padStart(2, "0")}</td>
              <td className="mono">{r.key}</td>
              <td className="num">{formatInt(r.count, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AttckTable({ attck, locale = "en" }: { attck: AttckRow[]; locale?: Locale }) {
  const { ui } = getCopy(locale);
  const max = attck[0]?.count ?? 1;
  return (
    <table>
      <thead>
        <tr>
          <th>{ui.attckTable.technique}</th>
          <th>{ui.attckTable.tactic}</th>
          <th className="num">{ui.attckTable.observed}</th>
        </tr>
      </thead>
      <tbody>
        {attck.map((t) => (
          <tr key={t.techniqueId}>
            <td>
              <span className="mono" style={{ fontWeight: 700 }}>
                <a
                  href={`https://attack.mitre.org/techniques/${t.techniqueId.replace(".", "/")}/`}
                  rel="noopener noreferrer"
                >
                  {t.techniqueId}
                </a>
              </span>{" "}
              {t.technique}
              <span
                className="countbar"
                style={{ width: `${Math.max(2, (t.count / max) * 100)}%` }}
                aria-hidden
              />
            </td>
            <td>
              <span className="chip">{t.tactic}</span>
            </td>
            <td className="num">{formatInt(t.count, locale)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
