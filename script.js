const inputText = document.getElementById("package-name-input");
const outputFrame = document.getElementById("html-output");

// Activate controls that are inert if JavaScript is disabled
inputText.disabled = false;
inputText.placeholder = "Enter Python package name here."
document.getElementsByTagName("button")[0].disabled = false;
document.getElementsByTagName("button")[0].style.visibility = "visible";
outputFrame.contentDocument.write("<!DOCTYPE html> Initializing...\n");

// Check if the browser supports WebAssembly
function checkForWebAssembly() {
  if (!("WebAssembly" in window)) {
    throw new Error(
      "This website requires WebAssembly because it depends on Pyodide to run docutils in the browser"
    );
  }
}

// Initialize Pyodide
async function main() {
  const startTime = Date.now();
  let pyodide = await loadPyodide();
  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
  outputFrame.contentDocument.write(`Ready in ${elapsedTime}s.\n`);
  // This makes the browser favicon stop the loading spinner
  outputFrame.contentDocument.close();

  return pyodide;
}
let pyodideReadyPromise = main();

async function readmeToHtml() {
  try {
    checkForWebAssembly();
    let pyodide = await pyodideReadyPromise;
    await pyodide.loadPackage("micropip");
    const micropip = pyodide.pyimport("micropip");
    await micropip.install('readme_renderer');

    const packageName = inputText.value;
    const pypiUrl = `https://pypi.org/pypi/${packageName}/json`;
    // Fetch the package's metadata from PyPI
    const response = await fetch(pypiUrl);
    const metadata = await response.json().then((data) => {
      return {
        description: data.info.description,
        description_content_type: data.info.description_content_type,
      };
    });

    pyodide.globals.set("input_text", metadata.description);
    pyodide.globals.set("content_type", metadata.description_content_type);

    const md = window.markdownit({
      html: true,
      linkify: true,
      typographer: true,
    });

    let result = null;

    if (metadata.description_content_type === "text/markdown") {
      result = md.render(metadata.description);
    } else {
      // Reference: https://github.com/pypi/warehouse/blob/8c51e0a2d3a54c6d99b73587ee95c23756728e70/warehouse/utils/readme.py#L19
      result = await pyodide.runPythonAsync(`
import readme_renderer.rst
import readme_renderer.txt

_RENDERERS = {
    None: readme_renderer.rst,  # Default if description_content_type is None
    "": readme_renderer.rst,  # Default if description_content_type is None
    "text/plain": readme_renderer.txt,
    "text/x-rst": readme_renderer.rst,
}

renderer = _RENDERERS.get(content_type, readme_renderer.txt)
renderer.render(input_text)`);
    }

    outputFrame.srcdoc = result;

    // Override Docutils' default style, which adds a grey background to the body element.
    // We need to wait until the iframe's load event; see https://stackoverflow.com/a/13959836/266309.
    outputFrame.addEventListener("load", (event) => {
      const newStyle = outputFrame.contentDocument.createElement("style");
      newStyle.textContent = "body { background-color: unset; }";
      event.target.contentDocument.head.appendChild(newStyle);
    });
  } catch (err) {
    const pre = document.createElement("pre");
    pre.textContent = err;
    outputFrame.srcdoc = pre.outerHTML;
  }
}
