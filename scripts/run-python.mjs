import { existsSync } from "node:fs"
import { spawnSync } from "node:child_process"
import path from "node:path"

const workspace = process.cwd()
const candidates = [
    process.env.EVAL_PYTHON,
    path.join(workspace, ".venv-evals", "Scripts", "python.exe"),
    path.join(workspace, ".venv-evals", "bin", "python"),
    path.join(workspace, "venv", "Scripts", "python.exe"),
    path.join(workspace, "venv", "bin", "python"),
].filter(Boolean)

const python = candidates.find((candidate) => existsSync(candidate)) || "python"
const result = spawnSync(python, process.argv.slice(2), {
    cwd: workspace,
    env: process.env,
    stdio: "inherit",
    shell: false,
})

if (result.error) {
    console.error(`Could not start Python (${python}): ${result.error.message}`)
    process.exitCode = 1
} else {
    process.exitCode = result.status ?? 1
}
