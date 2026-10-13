import { useState } from "react"

// ---- Types ------------------------------------------------------------------

type LOB = "Marine" | "Automobile" | "Aviation" | "Property"
type Layer = "bronze" | "silver" | "gold"
type TableStatus = "generated" | "pending"

interface LayerTable {
  name: string
  rows: number | null
  columns: string[]
  lastUpdated: string | null
  status: TableStatus
  size: string | null
  sampleData: string[][] | null
}

interface LayerInfo {
  layer: Layer
  label: string
  subtitle: string
  tables: LayerTable[]
}

// ---- Mock data --------------------------------------------------------------

const MOCK_DATA: Record<LOB, LayerInfo[]> = {
  Marine: [
    {
      layer: "bronze",
      label: "Bronze",
      subtitle: "Raw ingested data",
      tables: [
        {
          name: "POLICY_HEADER",
          rows: 10108,
          lastUpdated: "25 Sep 2026, 14:32",
          status: "generated",
          size: "4.2 MB",
          columns: [
            "POLICY_ID",
            "BROKER_ID",
            "INSURED_NAME",
            "INCEPTION_DATE",
            "EXPIRY_DATE",
            "PREMIUM_GROSS",
            "PREMIUM_NET",
            "CURRENCY",
            "LOB",
            "STATUS",
            "CREATED_AT",
            "UPDATED_AT",
          ],
          sampleData: [
            [
              "POL-M-00001",
              "BRK-012",
              "Meridian Shipping Ltd",
              "2025-01-15",
              "2026-01-14",
              "152,400",
              "128,016",
              "GBP",
              "Marine",
              "Active",
              "2025-01-10",
              "2025-06-20",
            ],
            [
              "POL-M-00002",
              "BRK-045",
              "Atlantic Cargo Inc",
              "2025-02-01",
              "2026-01-31",
              "87,650",
              "73,626",
              "USD",
              "Marine",
              "Active",
              "2025-01-28",
              "2025-07-15",
            ],
            [
              "POL-M-00003",
              "BRK-012",
              "Nordic Tankers AS",
              "2025-03-10",
              "2026-03-09",
              "204,800",
              "171,648",
              "GBP",
              "Marine",
              "Expired",
              "2025-03-05",
              "2026-03-10",
            ],
            [
              "POL-M-00004",
              "BRK-078",
              "Pacific Hull Corp",
              "2025-01-20",
              "2026-01-19",
              "315,000",
              "264,600",
              "USD",
              "Marine",
              "Active",
              "2025-01-15",
              "2025-09-01",
            ],
            [
              "POL-M-00005",
              "BRK-023",
              "Bengal Maritime",
              "2025-04-01",
              "2026-03-31",
              "62,300",
              "52,332",
              "GBP",
              "Marine",
              "Active",
              "2025-03-25",
              "2025-08-12",
            ],
            [
              "POL-M-00006",
              "BRK-056",
              "Caspian Fleet Ltd",
              "2025-02-14",
              "2026-02-13",
              "178,900",
              "150,276",
              "USD",
              "Marine",
              "Cancelled",
              "2025-02-10",
              "2025-11-30",
            ],
            [
              "POL-M-00007",
              "BRK-034",
              "Oceanic Bulk Carriers",
              "2025-05-01",
              "2026-04-30",
              "425,000",
              "357,000",
              "GBP",
              "Marine",
              "Active",
              "2025-04-22",
              "2025-10-18",
            ],
            [
              "POL-M-00008",
              "BRK-012",
              "Suez Canal Transit Co",
              "2025-03-15",
              "2026-03-14",
              "93,200",
              "78,288",
              "USD",
              "Marine",
              "Active",
              "2025-03-10",
              "2025-09-25",
            ],
          ],
        },
        {
          name: "COVERAGE_DETAIL",
          rows: 24671,
          lastUpdated: "25 Sep 2026, 14:32",
          status: "generated",
          size: "8.7 MB",
          columns: [
            "COVERAGE_ID",
            "POLICY_ID",
            "COVER_TYPE",
            "LIMIT_AMOUNT",
            "DEDUCTIBLE",
            "CURRENCY",
            "SECTION",
            "EFFECTIVE_FROM",
            "EFFECTIVE_TO",
            "STATUS",
          ],
          sampleData: [
            [
              "COV-00001",
              "POL-M-00001",
              "Hull & Machinery",
              "5,000,000",
              "50,000",
              "GBP",
              "Section A",
              "2025-01-15",
              "2026-01-14",
              "Active",
            ],
            [
              "COV-00002",
              "POL-M-00001",
              "P&I",
              "10,000,000",
              "100,000",
              "GBP",
              "Section B",
              "2025-01-15",
              "2026-01-14",
              "Active",
            ],
            [
              "COV-00003",
              "POL-M-00001",
              "War Risk",
              "2,000,000",
              "25,000",
              "GBP",
              "Section C",
              "2025-01-15",
              "2026-01-14",
              "Active",
            ],
            [
              "COV-00004",
              "POL-M-00002",
              "Cargo",
              "3,500,000",
              "35,000",
              "USD",
              "Section A",
              "2025-02-01",
              "2026-01-31",
              "Active",
            ],
            [
              "COV-00005",
              "POL-M-00002",
              "Freight",
              "1,200,000",
              "15,000",
              "USD",
              "Section B",
              "2025-02-01",
              "2026-01-31",
              "Active",
            ],
          ],
        },
        {
          name: "RISK_ASSET",
          rows: 10033,
          lastUpdated: "25 Sep 2026, 14:31",
          status: "generated",
          size: "5.1 MB",
          columns: [
            "ASSET_ID",
            "POLICY_ID",
            "VESSEL_NAME",
            "IMO_NUMBER",
            "VESSEL_TYPE",
            "FLAG_STATE",
            "GROSS_TONNAGE",
            "YEAR_BUILT",
            "CLASS_SOCIETY",
            "ASSET_VALUE",
            "CURRENCY",
          ],
          sampleData: [
            [
              "AST-00001",
              "POL-M-00001",
              "MV Meridian Star",
              "9234567",
              "Bulk Carrier",
              "Panama",
              "32,450",
              "2018",
              "Lloyd's Register",
              "18,500,000",
              "GBP",
            ],
            [
              "AST-00002",
              "POL-M-00002",
              "Atlantic Pioneer",
              "9345678",
              "Container Ship",
              "Liberia",
              "45,200",
              "2020",
              "DNV",
              "24,000,000",
              "USD",
            ],
            [
              "AST-00003",
              "POL-M-00003",
              "Nordic Spirit",
              "9456789",
              "Oil Tanker",
              "Norway",
              "58,900",
              "2015",
              "Bureau Veritas",
              "35,200,000",
              "GBP",
            ],
            [
              "AST-00004",
              "POL-M-00004",
              "Pacific Guardian",
              "9567890",
              "LNG Carrier",
              "Marshall Islands",
              "72,100",
              "2022",
              "ABS",
              "62,000,000",
              "USD",
            ],
          ],
        },
        {
          name: "CLAIM_EVENT",
          rows: 5460,
          lastUpdated: "25 Sep 2026, 14:30",
          status: "generated",
          size: "2.8 MB",
          columns: [
            "CLAIM_ID",
            "POLICY_ID",
            "CLAIM_DATE",
            "CAUSE_OF_LOSS",
            "INCURRED_AMOUNT",
            "PAID_AMOUNT",
            "CLAIM_STATUS",
            "CURRENCY",
          ],
          sampleData: [
            [
              "CLM-00001",
              "POL-M-00001",
              "2025-06-12",
              "Collision",
              "1,250,000",
              "850,000",
              "Open",
              "GBP",
            ],
            [
              "CLM-00002",
              "POL-M-00003",
              "2025-08-20",
              "Grounding",
              "3,400,000",
              "3,400,000",
              "Closed",
              "GBP",
            ],
            [
              "CLM-00003",
              "POL-M-00004",
              "2025-05-03",
              "Machinery Breakdown",
              "620,000",
              "0",
              "Denied",
              "USD",
            ],
          ],
        },
        {
          name: "UNDERWRITER",
          rows: 70,
          lastUpdated: "25 Sep 2026, 14:28",
          status: "generated",
          size: "0.1 MB",
          columns: ["UNDERWRITER_ID", "NAME", "SYNDICATE", "RATING"],
          sampleData: [
            ["UW-001", "Syndicate 2003", "Brit", "A+"],
            ["UW-002", "Syndicate 0623", "Beazley", "A"],
          ],
        },
        {
          name: "BROKER",
          rows: 59,
          lastUpdated: "25 Sep 2026, 14:28",
          status: "generated",
          size: "0.1 MB",
          columns: ["BROKER_ID", "NAME", "REGION", "STATUS"],
          sampleData: [
            ["BRK-012", "Marsh McLennan", "EMEA", "Active"],
            ["BRK-023", "Aon", "APAC", "Active"],
          ],
        },
      ],
    },
    {
      layer: "silver",
      label: "Silver",
      subtitle: "Cleaned and conformed",
      tables: [
        {
          name: "POLICY_HEADER_CLEAN",
          rows: 9847,
          lastUpdated: "25 Sep 2026, 15:01",
          status: "generated",
          size: "3.9 MB",
          columns: [
            "POLICY_ID",
            "BROKER_ID",
            "INSURED_NAME",
            "INCEPTION_DATE",
            "EXPIRY_DATE",
            "PREMIUM_GROSS",
            "PREMIUM_NET",
            "CURRENCY",
            "LOB",
            "STATUS",
            "CREATED_AT",
            "UPDATED_AT",
          ],
          sampleData: [
            [
              "POL-M-00001",
              "BRK-012",
              "Meridian Shipping Ltd",
              "2025-01-15",
              "2026-01-14",
              "152,400",
              "128,016",
              "GBP",
              "Marine",
              "Active",
              "2025-01-10",
              "2025-06-20",
            ],
            [
              "POL-M-00002",
              "BRK-045",
              "Atlantic Cargo Inc",
              "2025-02-01",
              "2026-01-31",
              "87,650",
              "73,626",
              "USD",
              "Marine",
              "Active",
              "2025-01-28",
              "2025-07-15",
            ],
            [
              "POL-M-00004",
              "BRK-078",
              "Pacific Hull Corp",
              "2025-01-20",
              "2026-01-19",
              "315,000",
              "264,600",
              "USD",
              "Marine",
              "Active",
              "2025-01-15",
              "2025-09-01",
            ],
          ],
        },
        {
          name: "COVERAGE_DETAIL_CLEAN",
          rows: 23912,
          lastUpdated: "25 Sep 2026, 15:01",
          status: "generated",
          size: "8.2 MB",
          columns: [
            "COVERAGE_ID",
            "POLICY_ID",
            "COVER_TYPE",
            "LIMIT_AMOUNT",
            "DEDUCTIBLE",
            "CURRENCY",
            "SECTION",
            "EFFECTIVE_FROM",
            "EFFECTIVE_TO",
            "STATUS",
          ],
          sampleData: [
            [
              "COV-00001",
              "POL-M-00001",
              "Hull & Machinery",
              "5,000,000",
              "50,000",
              "GBP",
              "Section A",
              "2025-01-15",
              "2026-01-14",
              "Active",
            ],
            [
              "COV-00004",
              "POL-M-00002",
              "Cargo",
              "3,500,000",
              "35,000",
              "USD",
              "Section A",
              "2025-02-01",
              "2026-01-31",
              "Active",
            ],
          ],
        },
        {
          name: "RISK_ASSET_CLEAN",
          rows: null,
          lastUpdated: null,
          status: "pending",
          size: null,
          columns: [],
          sampleData: null,
        },
        {
          name: "CLAIM_EVENT_CLEAN",
          rows: null,
          lastUpdated: null,
          status: "pending",
          size: null,
          columns: [],
          sampleData: null,
        },
        {
          name: "UNDERWRITER_CLEAN",
          rows: 70,
          lastUpdated: "25 Sep 2026, 15:00",
          status: "generated",
          size: "0.1 MB",
          columns: ["UNDERWRITER_ID", "NAME", "SYNDICATE", "RATING"],
          sampleData: [["UW-001", "Syndicate 2003", "Brit", "A+"]],
        },
        {
          name: "BROKER_CLEAN",
          rows: 59,
          lastUpdated: "25 Sep 2026, 15:00",
          status: "generated",
          size: "0.1 MB",
          columns: ["BROKER_ID", "NAME", "REGION", "STATUS"],
          sampleData: [["BRK-012", "Marsh McLennan", "EMEA", "Active"]],
        },
      ],
    },
    {
      layer: "gold",
      label: "Gold",
      subtitle: "Business-ready aggregates",
      tables: [
        {
          name: "POLICY_SUMMARY_AGG",
          rows: null,
          lastUpdated: null,
          status: "pending",
          size: null,
          columns: [],
          sampleData: null,
        },
        {
          name: "CLAIMS_TRIANGLE",
          rows: null,
          lastUpdated: null,
          status: "pending",
          size: null,
          columns: [],
          sampleData: null,
        },
        {
          name: "PREMIUM_REPORT",
          rows: null,
          lastUpdated: null,
          status: "pending",
          size: null,
          columns: [],
          sampleData: null,
        },
      ],
    },
  ],
  Automobile: [
    {
      layer: "bronze",
      label: "Bronze",
      subtitle: "Raw ingested data",
      tables: [
        {
          name: "POLICY_HEADER",
          rows: 10200,
          lastUpdated: "24 Sep 2026, 11:15",
          status: "generated",
          size: "4.5 MB",
          columns: [
            "POLICY_ID",
            "BROKER_ID",
            "INSURED_NAME",
            "INCEPTION_DATE",
            "STATUS",
          ],
          sampleData: [
            [
              "POL-A-00001",
              "BRK-015",
              "Fleet Motors Ltd",
              "2025-03-01",
              "Active",
            ],
          ],
        },
        {
          name: "VEHICLE_SCHEDULE",
          rows: 18770,
          lastUpdated: "24 Sep 2026, 11:15",
          status: "generated",
          size: "6.3 MB",
          columns: ["VEHICLE_ID", "POLICY_ID", "REGISTRATION", "MAKE", "MODEL"],
          sampleData: [
            ["VEH-00001", "POL-A-00001", "AB12 CDE", "Ford", "Transit"],
          ],
        },
        {
          name: "CLAIM_EVENT",
          rows: 8410,
          lastUpdated: "24 Sep 2026, 11:14",
          status: "generated",
          size: "3.1 MB",
          columns: ["CLAIM_ID", "POLICY_ID", "CLAIM_DATE", "FAULT_STATUS"],
          sampleData: [["CLM-A-001", "POL-A-00001", "2025-06-10", "At Fault"]],
        },
      ],
    },
    {
      layer: "silver",
      label: "Silver",
      subtitle: "Cleaned and conformed",
      tables: [
        {
          name: "POLICY_HEADER_CLEAN",
          rows: null,
          lastUpdated: null,
          status: "pending",
          size: null,
          columns: [],
          sampleData: null,
        },
        {
          name: "VEHICLE_SCHEDULE_CLEAN",
          rows: null,
          lastUpdated: null,
          status: "pending",
          size: null,
          columns: [],
          sampleData: null,
        },
      ],
    },
    {
      layer: "gold",
      label: "Gold",
      subtitle: "Business-ready aggregates",
      tables: [
        {
          name: "FLEET_RISK_REPORT",
          rows: null,
          lastUpdated: null,
          status: "pending",
          size: null,
          columns: [],
          sampleData: null,
        },
      ],
    },
  ],
  Aviation: [
    {
      layer: "bronze",
      label: "Bronze",
      subtitle: "Raw ingested data",
      tables: [
        {
          name: "POLICY_HEADER",
          rows: 10246,
          lastUpdated: "23 Sep 2026, 16:40",
          status: "generated",
          size: "4.8 MB",
          columns: ["POLICY_ID", "BROKER_ID", "INSURED_NAME", "UMR", "STATUS"],
          sampleData: [
            [
              "POL-AV-001",
              "BRK-034",
              "SkyFreight Corp",
              "UMR-2025-001",
              "Active",
            ],
          ],
        },
        {
          name: "AIRCRAFT_SCHEDULE",
          rows: 9800,
          lastUpdated: "23 Sep 2026, 16:40",
          status: "generated",
          size: "5.0 MB",
          columns: [
            "AIRCRAFT_ID",
            "POLICY_ID",
            "REGISTRATION",
            "MANUFACTURER",
            "MTOW_KG",
          ],
          sampleData: [["ACF-001", "POL-AV-001", "G-ABCD", "Boeing", "77,000"]],
        },
      ],
    },
    {
      layer: "silver",
      label: "Silver",
      subtitle: "Cleaned and conformed",
      tables: [
        {
          name: "POLICY_HEADER_CLEAN",
          rows: null,
          lastUpdated: null,
          status: "pending",
          size: null,
          columns: [],
          sampleData: null,
        },
      ],
    },
    {
      layer: "gold",
      label: "Gold",
      subtitle: "Business-ready aggregates",
      tables: [
        {
          name: "HULL_VALUE_REPORT",
          rows: null,
          lastUpdated: null,
          status: "pending",
          size: null,
          columns: [],
          sampleData: null,
        },
      ],
    },
  ],
  Property: [
    {
      layer: "bronze",
      label: "Bronze",
      subtitle: "Raw ingested data",
      tables: [
        {
          name: "POLICY_HEADER",
          rows: 10299,
          lastUpdated: "22 Sep 2026, 09:30",
          status: "generated",
          size: "4.6 MB",
          columns: [
            "POLICY_ID",
            "BROKER_ID",
            "INSURED_NAME",
            "COVER_BASIS",
            "STATUS",
          ],
          sampleData: [
            [
              "POL-P-00001",
              "BRK-067",
              "London Estates PLC",
              "All Risks",
              "Active",
            ],
          ],
        },
        {
          name: "PROPERTY_SCHEDULE",
          rows: 9250,
          lastUpdated: "22 Sep 2026, 09:30",
          status: "generated",
          size: "4.1 MB",
          columns: [
            "PROPERTY_ID",
            "POLICY_ID",
            "POSTCODE",
            "REBUILD_VALUE",
            "FLOOD_RISK_ZONE",
          ],
          sampleData: [
            ["PRP-001", "POL-P-00001", "EC1A 1BB", "2,400,000", "Low"],
          ],
        },
      ],
    },
    {
      layer: "silver",
      label: "Silver",
      subtitle: "Cleaned and conformed",
      tables: [
        {
          name: "POLICY_HEADER_CLEAN",
          rows: null,
          lastUpdated: null,
          status: "pending",
          size: null,
          columns: [],
          sampleData: null,
        },
      ],
    },
    {
      layer: "gold",
      label: "Gold",
      subtitle: "Business-ready aggregates",
      tables: [
        {
          name: "PROPERTY_RISK_AGG",
          rows: null,
          lastUpdated: null,
          status: "pending",
          size: null,
          columns: [],
          sampleData: null,
        },
      ],
    },
  ],
}

const LOBS: LOB[] = ["Marine", "Automobile", "Aviation", "Property"]

// ---- Colors -----------------------------------------------------------------

const layerColors: Record<Layer, {
  badge: string
  badgeBg: string
  badgeBorder: string
}> = {
  bronze: {
    badge: "#F5A623",
    badgeBg: "rgba(245,166,35,0.1)",
    badgeBorder: "rgba(245,166,35,0.25)",
  },
  silver: {
    badge: "#A78BFA",
    badgeBg: "rgba(167,139,250,0.1)",
    badgeBorder: "rgba(167,139,250,0.25)",
  },
  gold: {
    badge: "#06B6D4",
    badgeBg: "rgba(6,182,212,0.1)",
    badgeBorder: "rgba(6,182,212,0.25)",
  },
}

// ---- Component --------------------------------------------------------------

export default function DataEngineeringPage() {
  const [activeLob, setActiveLob] = useState<LOB>("Marine")
  const [modalTable, setModalTable] = useState<{
    table: LayerTable
    layer: Layer
  } | null>(null)
  const [expandedLayers, setExpandedLayers] = useState<Record<string, boolean>>(
    {},
  )

  function toggleExpanded(layer: Layer) {
    setExpandedLayers((prev) => ({ ...prev, [layer]: !prev[layer] }))
  }

  const layers = MOCK_DATA[activeLob]

  const totalGenerated = layers.reduce(
    (sum, l) => sum + l.tables.filter((t) => t.status === "generated").length,
    0,
  )
  const totalPending = layers.reduce(
    (sum, l) => sum + l.tables.filter((t) => t.status === "pending").length,
    0,
  )

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#F4F8FC" }}>
            Data Engineering
          </h1>
          <p className="text-[13px] max-w-2xl" style={{ color: "#8FA7BF", lineHeight: '1.75' }}>
            AI-generated Spark notebooks drive a Bronze → Silver → Gold medallion pipeline — raw ingested data is cleansed and standardised at Silver,
            then enriched, aggregated, and business-rule applied at Gold. Each layer is version-controlled, lineage-tracked, and ready for consumption
            by reporting dashboards, the reliability agent, and downstream AI models.
          </p>
        </div>
        <button
          className="flex items-center gap-2 text-[13px] font-semibold px-4 py-2 rounded-lg transition-colors"
          style={{ background: "#2DA8FF", color: "#fff" }}
        >
          <RunIcon />
          Run pipeline
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<NotebookIcon />}
          value={22}
          label="Active notebooks"
          color="#18C7A0"
          iconBg="rgba(24,199,160,0.1)"
          iconBorder="rgba(24,199,160,0.25)"
        />
        <StatCard
          icon={<ClockIcon />}
          value={totalPending}
          label="Pending review"
          color="#F5A623"
          iconBg="rgba(245,166,35,0.1)"
          iconBorder="rgba(245,166,35,0.25)"
        />
        <StatCard
          icon={<RefreshIcon />}
          value={84}
          label="Run today"
          color="#2DA8FF"
          iconBg="rgba(45,168,255,0.1)"
          iconBorder="rgba(45,168,255,0.25)"
        />
        <StatCard
          icon={<AlertIcon />}
          value={2}
          label="Failed runs"
          color="#EF4444"
          iconBg="rgba(239,68,68,0.1)"
          iconBorder="rgba(239,68,68,0.25)"
        />
      </div>

      {/* LOB tabs */}
      <div
        className="flex mb-6 rounded-xl overflow-hidden"
        style={{ background: "#102B48", border: "1px solid #214260" }}
      >
        {LOBS.map((lob) => (
          <button
            key={lob}
            onClick={() => {
              setActiveLob(lob)
              setExpandedLayers({})
            }}
            className="flex-1 py-3 text-[13px] font-medium transition-colors relative"
            style={{
              color: activeLob === lob ? "#06B6D4" : "#8FA7BF",
              background:
                activeLob === lob ? "rgba(6,182,212,0.08)" : "transparent",
              borderRight:
                lob !== LOBS[LOBS.length - 1] ? "1px solid #214260" : "none",
            }}
          >
            {lob}
            {activeLob === lob && (
              <span
                className="absolute bottom-0 left-[20%] right-[20%] h-[2px] rounded-full"
                style={{ background: "#06B6D4" }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Layer sections */}
      {layers.map((layerInfo) => {
        const generated = layerInfo.tables.filter(
          (t) => t.status === "generated",
        ).length
        const total = layerInfo.tables.length
        const allPending = generated === 0
        const colors = layerColors[layerInfo.layer]
        const isExpanded = !!expandedLayers[layerInfo.layer]
        const previewTables = isExpanded
          ? layerInfo.tables
          : layerInfo.tables.slice(0, 3)

        return (
          <div key={layerInfo.layer} className="mb-5">
            {/* Layer header */}
            <div className="flex items-center gap-3 mb-2">
              <span
                className="text-[11px] font-semibold px-3 py-0.5 rounded"
                style={{
                  color: colors.badge,
                  background: colors.badgeBg,
                  border: `1px solid ${colors.badgeBorder}`,
                }}
              >
                {layerInfo.label}
              </span>
              <span
                className="text-[13px] font-medium"
                style={{ color: "#F4F8FC" }}
              >
                {layerInfo.subtitle}
              </span>
              <span
                className="ml-auto flex items-center gap-1.5 text-[11px]"
                style={{ color: "#8FA7BF" }}
              >
                <span
                  className="w-[7px] h-[7px] rounded-full inline-block"
                  style={{
                    background: allPending
                      ? "#5a6a85"
                      : generated === total
                        ? "#18C7A0"
                        : "#F5A623",
                  }}
                />
                {allPending
                  ? "Not yet generated"
                  : generated === total
                    ? `${total} tables generated`
                    : `${generated} of ${total} tables`}
              </span>
            </div>

            {/* Table card */}
            <div
              className="rounded-xl overflow-hidden"
              style={{ background: "#102B48", border: "1px solid #214260" }}
            >
              {allPending ? (
                <div
                  className="flex flex-col items-center justify-center py-8 gap-1.5"
                  style={{ color: "#5a6a85" }}
                >
                  <HourglassIcon />
                  <span className="text-[12px]">
                    {layerInfo.layer === "gold"
                      ? "Gold layer tables will appear once the silver layer completes."
                      : `${layerInfo.label} layer tables will be generated when the pipeline runs.`}
                  </span>
                  <span className="text-[11px]" style={{ opacity: 0.7 }}>
                    Run the pipeline to begin transformation.
                  </span>
                </div>
              ) : (
                <>
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: "1px solid #18334F" }}>
                        {["Table", "Rows", "Last updated", "Status", ""].map(
                          (h) => (
                            <th
                              key={h}
                              className="text-left text-[10px] font-medium px-4 py-2.5"
                              style={{ color: "#8FA7BF" }}
                            >
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {previewTables.map((t) => (
                        <tr
                          key={t.name}
                          className={
                            t.status === "generated"
                              ? "cursor-pointer transition-colors group"
                              : ""
                          }
                          style={{
                            borderBottom: "1px solid rgba(24,51,79,0.6)",
                          }}
                          onClick={() =>
                            t.status === "generated" &&
                            setModalTable({ table: t, layer: layerInfo.layer })
                          }
                          onMouseEnter={(e) => {
                            if (t.status === "generated")
                              (e.currentTarget as HTMLElement).style.background =
                                "#162038"
                          }}
                          onMouseLeave={(e) => {
                            ;(e.currentTarget as HTMLElement).style.background =
                              ""
                          }}
                        >
                          <td
                            className="px-4 py-2.5 text-[12px]"
                            style={{ color: "#F4F8FC" }}
                          >
                            {t.name}
                          </td>
                          <td
                            className="px-4 py-2.5 font-mono text-[11px]"
                            style={{ color: "#8FA7BF" }}
                          >
                            {t.rows != null ? t.rows.toLocaleString() : "—"}
                          </td>
                          <td
                            className="px-4 py-2.5 font-mono text-[11px]"
                            style={{ color: "#8FA7BF" }}
                          >
                            {t.lastUpdated ?? "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            {t.status === "generated" ? (
                              <span
                                className="text-[11px] font-medium flex items-center gap-1"
                                style={{ color: "#18C7A0" }}
                              >
                                <CheckCircleIcon /> Generated
                              </span>
                            ) : (
                              <span
                                className="text-[11px] font-medium flex items-center gap-1"
                                style={{ color: "#F5A623" }}
                              >
                                <SmallClockIcon /> Pending
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {t.status === "generated" && (
                              <span
                                className="text-[11px] font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ color: "#2DA8FF" }}
                              >
                                <ExpandIcon /> View
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {total > 3 && (
                    <div
                      className="flex justify-center py-2"
                      style={{ borderTop: "1px solid #18334F" }}
                    >
                      <button
                        className="text-[11px] font-medium flex items-center gap-1"
                        style={{
                          color: "#2DA8FF",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                        }}
                        onClick={() => toggleExpanded(layerInfo.layer)}
                      >
                        <span
                          style={{
                            display: "inline-flex",
                            transition: "transform 0.2s",
                            transform: isExpanded
                              ? "rotate(180deg)"
                              : "rotate(0deg)",
                          }}
                        >
                          <ChevronDownIcon />
                        </span>
                        {isExpanded ? "Show fewer" : `Show all ${total} tables`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )
      })}

      {/* Table preview modal */}
      {modalTable && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(5,8,18,0.85)" }}
          onClick={() => setModalTable(null)}
        >
          <div
            className="rounded-xl flex flex-col overflow-hidden w-[90vw] max-w-[1100px] max-h-[80vh]"
            style={{ background: "#0f1729", border: "1px solid #1a2744" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div
              className="flex items-center justify-between px-5 py-4 flex-shrink-0"
              style={{ borderBottom: "1px solid #1a2744" }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="text-[11px] font-semibold px-3 py-0.5 rounded"
                  style={{
                    color: layerColors[modalTable.layer].badge,
                    background: layerColors[modalTable.layer].badgeBg,
                    border: `1px solid ${layerColors[modalTable.layer].badgeBorder}`,
                  }}
                >
                  {modalTable.layer.charAt(0).toUpperCase() +
                    modalTable.layer.slice(1)}
                </span>
                <span
                  className="text-[15px] font-semibold"
                  style={{ color: "#F4F8FC" }}
                >
                  {modalTable.table.name}
                </span>
              </div>
              <button
                onClick={() => setModalTable(null)}
                className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
                style={{ color: "#8FA7BF", background: "transparent" }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLElement).style.background = "#162038"
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLElement).style.background =
                    "transparent"
                }}
              >
                <XIcon />
              </button>
            </div>

            {/* Modal meta */}
            <div
              className="flex gap-6 px-5 py-3 flex-shrink-0"
              style={{ borderBottom: "1px solid #1a2744" }}
            >
              {[
                {
                  label: "Rows",
                  value: modalTable.table.rows?.toLocaleString() ?? "—",
                },
                {
                  label: "Columns",
                  value: String(modalTable.table.columns.length),
                },
                {
                  label: "Last updated",
                  value: modalTable.table.lastUpdated ?? "—",
                },
                { label: "Size", value: modalTable.table.size ?? "—" },
              ].map((m) => (
                <div
                  key={m.label}
                  className="text-[11px] flex items-center gap-1.5"
                  style={{ color: "#8FA7BF" }}
                >
                  {m.label}:{" "}
                  <span style={{ color: "#F4F8FC", fontWeight: 500 }}>
                    {m.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Modal table body */}
            <div className="flex-1 overflow-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    {modalTable.table.columns.map((col) => (
                      <th
                        key={col}
                        className="text-left text-[10px] font-medium px-4 py-2.5 sticky top-0"
                        style={{
                          color: "#8FA7BF",
                          borderBottom: "1px solid #1a2744",
                          background: "#0f1729",
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(modalTable.table.sampleData ?? []).map((row, ri) => (
                    <tr
                      key={ri}
                      className="transition-colors"
                      style={{ borderBottom: "1px solid rgba(26,39,68,0.4)" }}
                      onMouseEnter={(e) => {
                        ;(e.currentTarget as HTMLElement).style.background =
                          "#162038"
                      }}
                      onMouseLeave={(e) => {
                        ;(e.currentTarget as HTMLElement).style.background = ""
                      }}
                    >
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className="px-4 py-2 font-mono text-[11px]"
                          style={{
                            color: cell === "NULL" ? "#5a6a85" : "#e1e7ef",
                          }}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal footer */}
            <div
              className="flex items-center justify-between px-5 py-3 flex-shrink-0"
              style={{ borderTop: "1px solid #1a2744" }}
            >
              <span className="text-[11px]" style={{ color: "#8FA7BF" }}>
                Showing{" "}
                <span style={{ color: "#F4F8FC", fontWeight: 500 }}>
                  {modalTable.table.sampleData?.length ?? 0}
                </span>{" "}
                of{" "}
                <span style={{ color: "#F4F8FC", fontWeight: 500 }}>
                  {modalTable.table.rows?.toLocaleString() ?? "—"}
                </span>{" "}
                rows
              </span>
              <div className="flex gap-2">
                <ModalButton icon={<DownloadIcon />} label="Export CSV" />
                <ModalButton icon={<FilterIcon />} label="Filter" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---- Small components -------------------------------------------------------

function StatCard({
  icon,
  value,
  label,
  color,
  iconBg,
  iconBorder,
}: {
  icon: React.ReactNode
  value: number
  label: string
  color: string
  iconBg: string
  iconBorder: string
}) {
  return (
    <div
      className="rounded-xl p-4 flex items-center gap-3.5"
      style={{ background: "#102B48", border: "1px solid #214260" }}
    >
      <div
        className="w-[38px] h-[38px] rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: iconBg, border: `1px solid ${iconBorder}`, color }}
      >
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold" style={{ color }}>
          {value}
        </div>
        <div className="text-[11px]" style={{ color: "#8FA7BF" }}>
          {label}
        </div>
      </div>
    </div>
  )
}

function ModalButton({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-md transition-colors"
      style={{
        color: "#F4F8FC",
        background: "transparent",
        border: "1px solid #1a2744",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLElement).style.background = "#162038"
        ;(e.currentTarget as HTMLElement).style.borderColor = "#5a6a85"
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLElement).style.background = "transparent"
        ;(e.currentTarget as HTMLElement).style.borderColor = "#1a2744"
      }}
    >
      {icon}
      {label}
    </button>
  )
}

// ---- Icons ------------------------------------------------------------------

function RunIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 2l9 5-9 5V2z" fill="currentColor" stroke="none" />
    </svg>
  )
}
function NotebookIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 4h11a2 2 0 012 2v12a2 2 0 01-2 2H6" />
      <path d="M6 4v16" />
      <path d="M10 4v16" />
      <line x1="14" y1="8" x2="17" y2="8" />
      <line x1="14" y1="12" x2="17" y2="12" />
    </svg>
  )
}
function ClockIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}
function RefreshIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 11A8.1 8.1 0 004.5 9M4 5v4h4" />
      <path d="M4 13a8.1 8.1 0 0015.5 2M20 19v-4h-4" />
    </svg>
  )
}
function AlertIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  )
}
function CheckCircleIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}
function SmallClockIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l2 1.5" />
    </svg>
  )
}
function ExpandIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}
function ChevronDownIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}
function HourglassIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ opacity: 0.5 }}
    >
      <path d="M5 22h14" />
      <path d="M5 2h14" />
      <path d="M17 22v-4.172a2 2 0 00-.586-1.414L12 12l-4.414 4.414A2 2 0 007 17.828V22" />
      <path d="M7 2v4.172a2 2 0 00.586 1.414L12 12l4.414-4.414A2 2 0 0017 6.172V2" />
    </svg>
  )
}
function XIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
function DownloadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}
function FilterIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}
