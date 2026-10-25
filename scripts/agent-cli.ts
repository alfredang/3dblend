/**
 * Standalone harness CLI — generate a printable STL + Blender script from a prompt
 * without the web app:  npm run agent -- "a hex-pattern pencil cup, 80mm tall"
 */
import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { runHarness, createDeepSeekClient } from "../src/agent";

async function main() {
  const prompt = process.argv.slice(2).join(" ").trim();
  if (!prompt) {
    console.error('usage: npm run agent -- "describe the object"');
    process.exit(1);
  }
  const llm = createDeepSeekClient();
  const t0 = Date.now();
  const result = await runHarness(prompt, [], {
    llm,
    onEvent: (e) => {
      if (e.type === "status") console.log(`• ${e.text}`);
      if (e.type === "validation" && !e.ok) console.log("  ✗ spec:", e.errors.join(" | "));
      if (e.type === "build") console.log(e.ok ? `  ✓ built ${e.triangles} triangles` : `  ✗ build: ${e.error}`);
      if (e.type === "print") console.log(`  ${e.report.ok ? "✓" : "✗"} print`, JSON.stringify(e.report.metrics), e.report.errors, e.report.warnings);
    },
  });
  console.log(`\n${result.message}\n`);
  if (result.spec && result.stl && result.blender) {
    const dir = path.resolve("out");
    await fs.mkdir(dir, { recursive: true });
    const base = result.spec.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await fs.writeFile(path.join(dir, `${base}.stl`), result.stl);
    await fs.writeFile(path.join(dir, `${base}.blender.py`), result.blender);
    await fs.writeFile(path.join(dir, `${base}.spec.json`), JSON.stringify(result.spec, null, 2));
    console.log(`wrote out/${base}.stl, .blender.py, .spec.json  (${result.attempts} attempt(s), ${((Date.now() - t0) / 1000).toFixed(1)}s, ${result.model})`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
