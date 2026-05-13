import ReactMarkdown from "react-markdown";
import html2pdf from "html2pdf.js";

export default function Report({
  result,
  isRetrying,
  onRetry,
  patientName,
  reportTimestamp,
}) {
  const downloadPDF = () => {
    const element = document.getElementById("pdf-report-content");
    if (!element) return;

    const opt = {
      margin: 15,
      filename: `${patientName?.replace(/\s+/g, "_") || "Patient"}_Radiology_Report.pdf`,
      image: { type: "jpeg", quality: 1.0 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        scrollY: 0,
        backgroundColor: "#ffffff",
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };

    html2pdf().set(opt).from(element).save();
  };

  const formattedDate = reportTimestamp
    ? reportTimestamp.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  const formattedTime = reportTimestamp
    ? reportTimestamp.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header Area */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <h2 style={{ margin: 0, color: "#334155" }}>
          Automated AI Medical Report
        </h2>
        {result?.ai_report && !result.ai_report.includes("Failed") && (
          <button
            onClick={downloadPDF}
            className="process-btn"
            style={{ margin: 0, padding: "0.5rem 1rem" }}
          >
            📥 Download PDF
          </button>
        )}
      </div>

      {/* The Main Container - Added position: relative so the overlay works! */}
      <div
        className="report-box"
        style={{
          position: "relative",
          flexGrow: 1,
          width: "100%",
          boxSizing: "border-box",
          overflowY: "auto",
          display: "block",
        }}
      >
        {result?.ai_report ? (
          <>
            {/* --- THE RESTORED RETRY OVERLAY --- */}
            {result.ai_report.includes("Failed") && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: "rgba(255, 255, 255, 0.95)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "1.5rem",
                  textAlign: "center",
                  zIndex: 10,
                  borderRadius: "8px",
                }}
              >
                <div style={{ color: "#dc2626", marginBottom: "1rem" }}>
                  <svg
                    style={{ width: "3rem", height: "3rem", margin: "0 auto" }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    ></path>
                  </svg>
                  <p
                    style={{
                      fontWeight: "bold",
                      marginTop: "0.5rem",
                      fontSize: "1.1rem",
                    }}
                  >
                    API Connection Interrupted
                  </p>
                  <p
                    style={{
                      fontSize: "0.875rem",
                      color: "#475569",
                      marginTop: "0.25rem",
                    }}
                  >
                    {result.ai_report}
                  </p>
                </div>
                <button
                  onClick={onRetry}
                  disabled={isRetrying}
                  className="process-btn"
                  style={{
                    backgroundColor: "#dc2626",
                    opacity: isRetrying ? 0.5 : 1,
                    cursor: isRetrying ? "not-allowed" : "pointer",
                  }}
                >
                  {isRetrying ? "🔄 Connecting to AI..." : "🔄 Retry Report"}
                </button>
              </div>
            )}

            {/* --- THE PDF TARGET --- */}
            <div
              id="pdf-report-content"
              style={{
                backgroundColor: "#ffffff",
                padding: "1rem",
                color: "#0f172a",
              }}
            >
              {/* Title Block */}
              <div
                style={{
                  borderBottom: "2px solid #e2e8f0",
                  paddingBottom: "1rem",
                  marginBottom: "1.5rem",
                  textAlign: "center",
                }}
              >
                <h1
                  style={{
                    fontSize: "1.8rem",
                    margin: "0 0 0.5rem 0",
                    color: "#0f172a",
                  }}
                >
                  Radiology Core Analysis
                </h1>
                <p
                  style={{
                    margin: 0,
                    color: "#64748b",
                    fontWeight: "bold",
                    textTransform: "uppercase",
                    fontSize: "0.85rem",
                    letterSpacing: "1px",
                  }}
                >
                  Graph-TranFuse Ablation Engine
                </p>
              </div>

              {/* Demographics Block */}
              <div
                style={{
                  backgroundColor: "#f8fafc",
                  borderTop: "2px solid #e2e8f0",
                  borderBottom: "2px solid #e2e8f0",
                  padding: "1rem",
                  marginBottom: "2rem",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <p
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: "bold",
                      color: "#64748b",
                      textTransform: "uppercase",
                      margin: "0 0 0.25rem 0",
                    }}
                  >
                    Patient Name
                  </p>
                  <p
                    style={{ margin: 0, fontWeight: "bold", color: "#0f172a" }}
                  >
                    {patientName}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: "bold",
                      color: "#64748b",
                      textTransform: "uppercase",
                      margin: "0 0 0.25rem 0",
                    }}
                  >
                    Date & Time of Generation
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontFamily: "monospace",
                      color: "#0f172a",
                    }}
                  >
                    {formattedDate} <span style={{ margin: "0 5px" }}>|</span>{" "}
                    {formattedTime} HR
                  </p>
                </div>
              </div>

              {/* Markdown Body */}
              <div style={{ color: "#334155", lineHeight: "1.6" }}>
                <ReactMarkdown
                  components={{
                    p: ({ node: _node, ...props }) => (
                      <p style={{ marginBottom: "2rem" }} {...props} />
                    ),
                  }}
                >
                  {result.ai_report}
                </ReactMarkdown>
              </div>
            </div>
          </>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              minHeight: "250px",
            }}
          >
            <p
              className="placeholder-text"
              style={{ textAlign: "center", width: "100%" }}
            >
              Awaiting NIfTI processing...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
