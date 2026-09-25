import type { Copy } from "./types";
import { REPO_URL } from "./constants";
import { pluralIs } from "@/lib/format";

export const is: Copy = {
  locale: "is",

  meta: {
    title: "Hunang — hunangsgildra, talin heiðarlega | Kastro Labs",
    description:
      "Beinar mælingar úr SSH/Telnet-hunangsgildru: sjálfvirkir bottar giska á sjálfgefin lykilorð allan sólarhringinn. Bakgrunnssuð internetsins, skráð niður.",
    ogTitle: "Hunang — hunangsgildra, talin heiðarlega | Kastro Labs",
    ogDescription:
      "Hvað gerist þegar vél er sett á internetið: stanslausar sjálfvirkar lykilorðaárásir, kortlagðar á MITRE ATT&CK.",
    kioskTitle: "Hunang-mælaborð í beinni | Kastro Labs",
    kioskDescription: "Beinar mælingar Hunang-gildrunnar á öllum skjánum.",
  },

  story: {
    nav: {
      numbers: "Tölurnar",
      map: "Kort",
      ipVersions: "IPv6",
      credentials: "Auðkenni",
      attck: "ATT&CK",
      defense: "Varnir",
      method: "Aðferð",
      dashboard: "Mælaborð ↗",
    },
    hero: {
      eyebrow: "Hunangsgildra í beinni",
      sensor: "SSH + Telnet nemi",
      location: "Helsinki, Finnland",
      title: (
        <>
          Settu vél á netið.
          <br />
          Teldu hvað gerist.
        </>
      ),
      standfirst: (delay) => (
        <>
          Þessi síða er tengd hunangsgildru, tálbeituserveri sem tekur við óumbeðnum
          innskráningartilraunum af internetinu og skráir þær niður. Engum var sagt að hann væri
          til. <strong>Fyrsta árásin barst eftir {delay}</strong> og síðan hefur ekki verið
          hljótt. Ekkert hér er beint gegn þessari vél sérstaklega; hver einasta tilraun kemur
          frá botta sem vinnur sig í gegnum allt internetið.
        </>
      ),
    },
    numbers: {
      heading: "Tölurnar",
      sub: (since) => <>frá upphafi · síðan {since}</>,
      calloutLabel: "Lestu þetta á undan gröfunum",
      callout: (
        <>
          <p>
            Allt á þessari síðu er sjálfvirkt bakgrunnssuð. Engin manneskja valdi þessa vél;
            botnet skanna allt internetið og prófa sjálfgefin lykilorð á hverju því sem svarar.
            Þessi vél skráði það bara niður. Ef þú setur server á netið með
            lykilorðainnskráningu og lykilorði sem auðvelt er að giska á finnur þessi umferð
            hann, oftast innan klukkustundar.
          </p>
          <p>
            Ekkert af þessu þurfti því hæfan árásaraðila, og tölurnar hér fyrir neðan eru
            ekki ógnarupplýsingar. Það sem þær mæla er grunnlínan: hversu fjandsamlegt opna
            internetið er og hversu lítið þarf til að lenda í innbroti af slysni.
          </p>
        </>
      ),
    },
    clock: {
      heading: "Allan sólarhringinn",
      sub: "innskráningartilraunir yfir tíma",
      prose: (
        <>
          Það er aldrei rólegt. Botnetin sem standa að þessu eru dreifð um öll tímabelti og
          stoppa aldrei; lægðirnar og topparnir koma frá herferðum sem hefjast og enda, ekki frá
          vinnudegi neins.
        </>
      ),
    },
    where: {
      heading: "Hvaðan þetta kemur",
      sub: "aðeins samanlagðar tölur",
      asnHeading: "Helstu upprunanet (ASN)",
      prose: (
        <>
          Land og net segja þér hvar sýktar vélar og ódýr VPS-hýsing eru, ekki hvar
          „árásaraðilinn“ heldur til. Stór hluti þessarar umferðar kemur frá tækjum í eigu
          fólks sem veit ekki af því.
        </>
      ),
    },
    ipVersions: {
      heading: "IPv4 á móti IPv6",
      sub: "innskráningartilraunir · síðustu 24 klst.",
      ipv4: "IPv4",
      ipv6: "IPv6",
      attempts: "tilraunir",
      share: "af skráðri umferð",
      ratio: (ratio) => <><strong>{ratio}×</strong> fleiri tilraunir bárust yfir IPv4.</>,
      noTraffic: <>Engar innskráningartilraunir voru skráðar á þessu tímabili.</>,
      prose: (
        <>
          Neminn hlustar á báðar vistfangagerðir. Þroskuð botnet skanna IPv4 og geta farið hratt
          yfir smærra vistfangarýmið; IPv6-rýmið er svo stórt að blind skönnun er mun óhagkvæmari.
          Þetta ber saman umferð sem náði til þessa eina nema, en mælir ekki öryggi
          samskiptastaðlanna sjálfra.
        </>
      ),
    },
    credentials: {
      heading: "Hvað þeir prófa",
      sub: "algengustu auðkennin",
      topUsernames: "Helstu notandanöfn",
      topPasswords: "Helstu lykilorð",
      tooling: "Árásartól (kennistrengir SSH-biðlara)",
      prose: (
        <>
          Hér er engin snjöll veikleikanýting, bara orðalistar. Bottarnir prófa{" "}
          <span className="cred">root<span className="sep">/</span>123456</span> af því að
          einhvers staðar þarna úti virkar það enn nógu oft til að halda botneti gangandi.
        </>
      ),
    },
    attck: {
      heading: "Kortlagt á MITRE ATT&CK",
      sub: "skráð hegðun → tækni",
      intro: (
        <>
          Hver skráð hegðun er flokkuð eftir{" "}
          <a href="https://attack.mitre.org/" rel="noopener noreferrer">MITRE ATT&amp;CK</a>,
          sameiginlega orðaforðanum sem varnaraðilar nota til að tala um aðferðir árásaraðila.
          Kortlagningin er viljandi íhaldssöm: tækni er aðeins talin þegar atburðurinn er bein
          sönnun fyrir henni (flokkarinn og prófin hans eru{" "}
          <a href={REPO_URL} rel="noopener noreferrer">opinn hugbúnaður</a>). Heiti tækna og
          taktíka eru ensk heiti MITRE og halda sér óþýdd.
        </>
      ),
      outro: (
        <>
          Tölurnar eru atburðir, ekki atvik. Dæmigerð bottalota skilar einni tengingu, hrinu af
          lykilorðatilraunum og, ef hún fær skel, stuttri skriftaðri runu af könnun, niðurhali og
          tilraunum til að koma sér fyrir. Skelin sem hún fær hér er fölsk.
        </>
      ),
    },
    defense: {
      heading: "Hvað hefði stöðvað þetta",
      sub: "fyrir hvern árásarflokk: leiðinlega vörnin sem virkar",
      cards: [
        {
          label: (observed) => <>Lykilorðaágiskun · sást {observed}×</>,
          title: "Lykilorðaúði",
          body: (
            <>
              Endalausir orðalistar af algengum lykilorðum á <span className="mono">root</span>{" "}
              og <span className="mono">admin</span>. Magnið vinnur verkið.
            </>
          ),
          fix: (
            <>
              <strong>Stöðvað með:</strong> að slökkva alveg á lykilorðainnskráningu
              (<span className="mono">PasswordAuthentication no</span>) og nota SSH-lykla.
              Fail2ban og hraðatakmörkun draga úr suðinu en innskráning eingöngu með lyklum er
              það sem bindur enda á leikinn.
            </>
          ),
        },
        {
          label: (observed) => <>Sjálfgefnir aðgangar · sáust {observed}×</>,
          title: "Verksmiðjulykilorð",
          body: (
            <>
              <span className="cred">pi<span className="sep">/</span>raspberry</span>,{" "}
              <span className="cred">ubnt<span className="sep">/</span>ubnt</span>: tæki sem koma
              með skjalfestum aðgangsorðum sem aldrei var breytt.
            </>
          ),
          fix: (
            <>
              <strong>Stöðvað með:</strong> að breyta eða loka sjálfgefnum aðgöngum áður en
              vélin snýr að netinu. Líttu á fyrstu ræsingu sem hluta af uppsetningunni, ekki sem
              eitthvað sem má gera seinna.
            </>
          ),
        },
        {
          label: (observed) => <>Flutningur tóla · sást {observed}×</>,
          title: "Uppsetning spilliforrita",
          body: (
            <>
              Eftir „vel heppnaða“ innskráningu: spilliforrit sótt með{" "}
              <span className="mono">wget</span> í <span className="mono">/tmp</span>,{" "}
              <span className="mono">chmod 777</span>, keyrt. Oftast Mirai-afbrigði eða
              námuforrit.
            </>
          ),
          fix: (
            <>
              <strong>Stöðvað með:</strong> útumferðarsíun (serverar þurfa sjaldan ótakmarkaðan
              HTTP-aðgang út), <span className="mono">noexec</span> á möppur sem allir mega
              skrifa í og viðvörunum um nýjar keyrsluskrár.
            </>
          ),
        },
        {
          label: (observed) => <>Varanlegur aðgangur · sást {observed}×</>,
          title: "Lyklar og cron-verk",
          body: (
            <>
              Árásarlykli bætt við <span className="mono">authorized_keys</span> eða cron-færslu
              komið fyrir, svo bottinn komist aftur inn jafnvel eftir að lykilorði er breytt.
            </>
          ),
          fix: (
            <>
              <strong>Stöðvað með:</strong> heilleikavöktun á{" "}
              <span className="mono">~/.ssh</span> og cron-möppum (auditd, Wazuh) og viðvörunum
              um breytingar á authorized_keys sem þú gerðir ekki sjálfur.
            </>
          ),
        },
        {
          label: (observed) => <>Könnun · sást {observed}×</>,
          title: "Skriftuð könnun",
          body: (
            <>
              <span className="mono">uname -a</span>, <span className="mono">cat /proc/cpuinfo</span>,{" "}
              <span className="mono">cat /etc/passwd</span>: bottinn er að meta hvort vélin
              henti í rafmyntagröft eða botnetþjónustu.
            </>
          ),
          fix: (
            <>
              <strong>Stöðvað með:</strong> öllu hér að ofan. Um leið og könnunin keyrir er
              vélin þegar fallin; forvarnirnar liggja í innskráningunni og því hvað snýr út á
              netið. Það sem þessi lína gefur þér er viðvörunarbjalla.
            </>
          ),
        },
        {
          label: () => <>Aðgengi · rót vandans</>,
          title: "Sjálft opna portið",
          body: (
            <>
              Öll þessi umferð er til komin af því að port 22 svaraði. Flestar vélar þurfa ekki
              að hafa SSH aðgengilegt öllu internetinu.
            </>
          ),
          fix: (
            <>
              <strong>Stöðvað með:</strong> að hafa SSH ekki opið út á internetið. Notaðu
              WireGuard, IP-leyfilista eða stökkvél. Að færa SSH á óhefðbundið port minnkar
              bara suðið; skannarnir prófa slík port líka.
            </>
          ),
        },
      ],
    },
    method: {
      heading: "Aðferð & meðferð gagna",
      sub: "hvernig þetta virkar og hvað er geymt",
      how: (
        <>
          <h3 style={{ marginBottom: "0.5rem" }}>Hvernig þetta virkar</h3>
          <p>
            Neminn er <a href="https://github.com/cowrie/cowrie" rel="noopener noreferrer">Cowrie</a>,
            rótgróin hunangsgildra sem hermir eftir SSH/Telnet-serveri með falskri skel, svo
            árásaraðilar eiga við upptöku frekar en alvöru kerfi. Hún keyrir á einangraðri,
            einnota vél með útumferð einskorðaða við eina fjarmælingarás og geymir engin
            auðkenni að neinu raunverulegu.
          </p>
          <p>
            Atburðir streyma í eina átt: nemi → auðkennt inntöku-API → gagnagrunnur →
            forsamanteknar tölur → þessi síða. Síðan sem þú ert að lesa tengist gildrunni aldrei
            og birtir aðeins samanlögð gögn. Full lýsing á högun, ógnarlíkani og rekstri er{" "}
            <a href={REPO_URL} rel="noopener noreferrer">á GitHub</a>.
          </p>
        </>
      ),
      data: (
        <>
          <h3 style={{ marginBottom: "0.5rem" }}>Meðferð gagna</h3>
          <p>
            Uppruna-IP-tölur eru persónuupplýsingar samkvæmt GDPR og eru meðhöndlaðar sem
            slíkar: við inntöku er þeim skipt út fyrir lyklað dulnefni (HMAC) og stytt
            netforskeyti (/24 eða /48). Hráar IP-tölur eru aldrei geymdar eða birtar. Hráum
            atburðafærslum er eytt eftir 30 daga; tölurnar á þessari síðu eru nafnlausar
            heildartölur, teknar saman einu sinni úr hverjum atburði og geymdar án nokkurra
            gagna um einstaka uppruna.
          </p>
          <p>
            Notandanöfnin, lykilorðin og skipanirnar sem birtast hér voru slegin inn af
            sjálfvirkum tólum á tálbeituvél. Þessi síða notar engar vefkökur. Vercel Web
            Analytics safnar nafnlausum, samanlögðum tölum um síðuflettingar. Staðsetning
            árásarumferðar er fundin úr gagnaskrám á servernum sjálfum svo IP-tala sem sést í
            árás er aldrei send þriðja aðila; dulnefnda atburðasafnið er hýst innan ESB á eigin
            Coolify-innviðum Kastro Labs. Landa- og netgögn frá{" "}
            <a href="https://db-ip.com" rel="noopener noreferrer">DB-IP</a> (CC BY 4.0).
            Spurningar: <a href="https://andri.is">andri.is</a>.
          </p>
        </>
      ),
    },
    footer: {
      credit: (
        <>
          hunang · verkefni frá{" "}
          <a href="https://kastro.is">kastro labs</a> · smíðað, brotið &amp; gefið út af{" "}
          <a href="https://andri.is">Andra</a>
        </>
      ),
      source: "Kóðinn á GitHub",
      privacy: "Engar vefkökur · nafnlaus síðugreining · aðeins samtölur árása",
      tagline: "viva la firewall",
    },
    ticker: {
      loginAttempts: "Skráðar innskráningartilraunir",
      lifetimeNote: "frá upphafi · síðan neminn fór í loftið",
      last24h: "Síðustu 24 klst.",
      oneEveryPrefix: "≈ ein á ",
      oneEverySuffix: " fresti",
      sources: "Ólík upptök",
      sourcesNote: "frá upphafi · dulnefnd við inntöku",
      firstAttack: "Fyrsta árás eftir opnun",
      firstAttackNote: "engum var sagt að þessi vél væri til",
      updatedPrefix: "uppfært ",
      updatedSuffix: " · uppfærist sjálfkrafa",
    },
  },

  kiosk: {
    telemetry: "hunangsgildra í beinni · ssh + telnet",
    noSource: "engin gagnalind stillt",
    backLink: "← öll sagan",
    loginAttempts: "Innskráningartilraunir · frá upphafi",
    last24h: "Síðustu 24 klst.",
    sources: "Upptök",
    sessions: "Lotur",
    commands: "Skipanir",
    firstAttack: (delay) => `fyrsta árás eftir ${delay}`,
    oneEvery: (rate) => `≈ ein á ${rate} fresti`,
    topCredentials: "Algengustu auðkennin",
    attemptsPerHour: "Tilraunir á klst. · síðustu 48 klst.",
    topCountries: "Helstu upprunalönd",
    topUsernames: "Helstu notandanöfn",
    topPasswords: "Helstu lykilorð",
    controls: {
      updated: "uppfært",
      fullscreen: "⛶ fullskjár",
    },
  },

  ui: {
    credTable: { rank: "#", userPass: "Notandanafn / lykilorð", tries: "Tilraunir" },
    attckTable: { technique: "Tækni", tactic: "Taktík", observed: "Fjöldi" },
    countryTable: { rank: "#", country: "Upprunaland", attempts: "Tilraunir", share: "Hlutfall" },
    mapAria: "Heimskort af innskráningartilraunum eftir upprunalandi",
    legend: { fewer: "færri", more: "fleiri", none: "engar skráðar" },
    mapTooltipCount: (count, n) =>
      `: ${count} ${pluralIs(n, "innskráningartilraun", "innskráningartilraunir")}`,
    mapTooltipNone: ": engar tilraunir skráðar",
    mapUnknown: "Óþekkt",
    chartAria: (granularity, span) =>
      granularity === "hour"
        ? `Innskráningartilraunir á klukkustund, síðustu ${span} klukkustundir`
        : `Innskráningartilraunir á dag, síðustu ${span} daga`,
    chartCaption: (granularity, span, peak) =>
      `${granularity === "hour" ? `síðustu ${span} klst.` : `síðustu ${span} daga`} · hámark ${peak} / ${granularity === "hour" ? "klst." : "dag"} · UTC`,
    chartTooltip: (count, n) => `— ${count} ${pluralIs(n, "tilraun", "tilraunir")}`,
  },
};
