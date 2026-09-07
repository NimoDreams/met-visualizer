import { useState } from "react";

export const TIP_JAR_SNS = "nimodreams.sol";
export const TIP_JAR_ADDRESS = "DxYUGfMtgHmuo1VGRAEUjzcpuCwWCA5xggbgJUZuaFwF";

type CopyState = "idle" | "copying" | "copied" | "failed";

export function TipJar() {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  async function copyAddress() {
    setCopyState("copying");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Unavailable");
      await navigator.clipboard.writeText(TIP_JAR_ADDRESS);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  const feedback =
    copyState === "copying"
      ? "Copying address…"
      : copyState === "copied"
        ? "Address copied."
        : copyState === "failed"
          ? "Copy failed. Select and copy the full address instead."
          : "";

  return (
    <section className="surface tip-jar" aria-labelledby="tip-jar-heading">
      <div className="tip-jar-copy">
        <div>
          <p className="eyebrow">Optional support</p>
          <h2 id="tip-jar-heading">Tip Jar</h2>
          <p>
            If this tool is useful, support is appreciated but never required.
            It does not change access or functionality.
          </p>
        </div>
        <button
          aria-describedby="tip-jar-copy-feedback"
          className="button-secondary"
          disabled={copyState === "copying"}
          onClick={() => void copyAddress()}
          type="button"
        >
          {copyState === "copying" ? "Copying…" : "Copy address"}
        </button>
      </div>
      <dl className="tip-jar-identifiers">
        <div>
          <dt>SNS identity</dt>
          <dd>
            <code>{TIP_JAR_SNS}</code>
          </dd>
        </div>
        <div>
          <dt>Canonical Solana address</dt>
          <dd>
            <code>{TIP_JAR_ADDRESS}</code>
          </dd>
        </div>
      </dl>
      <p
        className={`tip-jar-feedback ${copyState === "failed" ? "failed" : ""}`}
        id="tip-jar-copy-feedback"
        role={copyState === "failed" ? "alert" : "status"}
      >
        {feedback}
      </p>
    </section>
  );
}
