import { useState, useCallback, useRef } from "react";
import { useDropzone } from "react-dropzone";
import axios from "axios";
import Report from "./Report";
import "./App.css";

function App() {
  const [patientName, setPatientName] = useState("");
  const [mriFile, setMriFile] = useState(null);
  const [statusText, setStatusText] = useState("No scan uploaded");
  const [result, setResult] = useState(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [reportTimestamp, setReportTimestamp] = useState(null);

  const inputRef = useRef(null);

  const handleClick = () => {
    inputRef.current.focus();
  };

  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (file) {
      setMriFile(file);
      setResult(null);
      setReportTimestamp(null);
      setStatusText("Ready to process");
    }
  }, []);

  const handleProcess = async () => {
    if (!mriFile || !patientName.trim()) return;
    setStatusText("Uploading and running pytorch inference...");

    const formData = new FormData();
    formData.append("file", mriFile);

    // Inside App.jsx -> handleProcess
    try {
      const response = await axios.post(
        "http://localhost:8000/api/segment",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );

      // Check if backend returned an error instead of results
      if (response.data.error) {
        setStatusText(`Backend Error: ${response.data.error}`);
        return;
      }

      setResult(response.data);
      setReportTimestamp(new Date());

      // Use optional chaining (?.) to prevent the crash you're seeing
      const totalVol = response.data.ai_metrics?.total_volume || "0";
      setStatusText(`Success! NIFTI Volume: ${totalVol} mm³`);
    } catch (error) {
      console.error("Error sending file: ", error);
      setStatusText("Error communicating with Python backend.");
    }
  };

  const handleRetryReport = async () => {
    if (!result?.ai_metrics) return;
    setIsRetrying(true);

    try {
      const payload = {
        edema: result.ai_metrics.edema,
        necrotic: result.ai_metrics.necrotic,
        enhancing: result.ai_metrics.enhancing,
        total_volume: result.ai_metrics.total_volume,
        is_active: result.ai_metrics.model_status === "Active",
      };

      const response = await axios.post(
        "http://localhost:8000/api/retry_report",
        payload,
      );

      // This updates the result state so Report.jsx sees the new text
      setResult((prev) => ({
        ...prev,
        ai_report: response.data.ai_report,
      }));
    } catch (error) {
      console.error("Retry failed:", error);
    } finally {
      setIsRetrying(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/octet-stream": [".nii", ".nii.gz"] },
    maxFiles: 1,
  });

  return (
    <div className="dashboard-container bg-gray-50 min-h-screen text-gray-900 font-sans">
      <header className="dashboard-header bg-white border-b border-gray-200 p-6 mb-6 shadow-sm text-center">
        <h1
          className="text-3xl font-bold text-blue-900"
          style={{ textAlign: "center" }}
        >
          Clinical Radiology Dashboard
        </h1>
        <p className="text-gray-600 mt-2" style={{ textAlign: "center" }}>
          Graph-TranFuse Ablation Model | CSE (IDD) Exploratory Project
        </p>
      </header>

      <main className="dashboard-main max-w-7xl mx-auto px-4 flex flex-col md:flex-row gap-8">
        {/* LEFT COLUMN: Upload & Image Viewer */}
        <section className="viewer-section w-full md:w-1/2 p-6 bg-white rounded-lg border border-gray-200 shadow-sm">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">
            MRI Ingestion (.nii / .nii.gz)
          </h2>

          <div style={{ marginBottom: "1.5rem" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.875rem",
                fontWeight: "bold",
                color: "#334155",
                marginBottom: "0.5rem",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Patient Full Name <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              ref={inputRef}
              type="text"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="e.g. Manan Kumawat"
              style={{
                width: "100%",
                padding: "0.75rem 1rem",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                fontSize: "1rem",
                boxSizing: "border-box",
                backgroundColor: "#ffffff",
                color: "#0f172a",
                outline: "none",
              }}
            />
          </div>

          <div
            {...getRootProps()}
            className={`dropzone border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 bg-gray-50 hover:bg-gray-100"
            }`}
          >
            <input {...getInputProps()} />
            {statusText.startsWith("No") ? (
              <div className="text-gray-600">
                {isDragActive ? (
                  <p className="font-bold text-blue-600">
                    Drop the NIfTI file here ...
                  </p>
                ) : (
                  <div>
                    <p className="font-medium">
                      Drag 'n' drop a MRI (.nii or .nii.gz) file here
                    </p>
                    <p className="text-sm mt-1">or click to select</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-600">
                Uploading another file will make the current progress redundant!
              </p>
            )}
          </div>

          <div className="image-display-box mt-6">
            {mriFile ? (
              <div className="loaded-state text-center">
                {statusText.startsWith("Ready") ? (
                  <div>
                    <p className="text-gray-700 mb-4">
                      Ready to process:{" "}
                      <strong className="text-blue-700">{mriFile.name}</strong>
                    </p>
                    <button
                      className="process-btn bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded shadow"
                      onClick={
                        !patientName.trim() ? handleClick : handleProcess
                      }
                    >
                      {!patientName.trim()
                        ? "Enter Patient Name to Continue"
                        : "Run Segmentation Model"}{" "}
                    </button>
                  </div>
                ) : (
                  <div className="status-indicator">
                    {result ? (
                      <div className="mt-4 p-6 bg-green-50 rounded-lg border border-green-200 shadow-sm text-left">
                        <h3 className="text-lg font-bold text-green-800 mb-4 border-b border-green-200 pb-2">
                          ✅ AI Analysis Complete
                        </h3>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-white p-3 rounded border border-gray-100 shadow-sm">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              Edema Volume
                            </p>
                            <p className="font-mono text-blue-600 font-bold mt-1">
                              {result.ai_metrics?.edema} mm³
                            </p>
                          </div>

                          <div className="bg-white p-3 rounded border border-gray-100 shadow-sm">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              Necrotic Core
                            </p>
                            <p className="font-mono text-red-600 font-bold mt-1">
                              {result.ai_metrics?.necrotic} mm³
                            </p>
                          </div>

                          <div className="bg-white p-3 rounded border border-gray-100 shadow-sm">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              Enhancing Tumor
                            </p>
                            <p className="font-mono text-green-600 font-bold mt-1">
                              {result.ai_metrics?.enhancing} mm³
                            </p>
                          </div>

                          <div className="bg-white p-3 rounded border border-gray-100 shadow-sm">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              Total Burden
                            </p>
                            <p className="font-mono text-purple-600 font-bold mt-1">
                              {result.ai_metrics?.total_volume} mm³
                            </p>
                          </div>
                        </div>

                        <button
                          className="mt-6 w-full bg-gray-800 text-white py-3 rounded-lg hover:bg-black transition flex items-center justify-center gap-2 font-bold"
                          onClick={() => window.open(result.mask_url)}
                        >
                          <span>💾</span> Download AI Segmentation Mask
                          (.nii.gz)
                        </button>
                      </div>
                    ) : (
                      <strong className="text-blue-600">{statusText}</strong>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state text-center text-gray-500 p-4 bg-gray-50 rounded border border-gray-200">
                <strong>{statusText}</strong>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: AI Medical Report (Fully Modularized) */}
        <section className="report-section w-full md:w-1/2 p-6 bg-white rounded-lg border border-gray-200 shadow-sm">
          <Report
            result={result}
            isRetrying={isRetrying}
            onRetry={handleRetryReport}
            patientName={patientName}
            reportTimestamp={reportTimestamp}
          />
        </section>
      </main>
    </div>
  );
}

export default App;
