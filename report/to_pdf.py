"""Convert the generated .docx documents to PDF with the contents page filled in.

    python report/to_pdf.py report/MediPlate_Project_Report.docx
    python report/to_pdf.py report/*.docx

Word stores a table of contents as a *field*: the entries are not in the file,
they are computed when the document is opened. A plain LibreOffice conversion
therefore produces a PDF with an empty contents page. This script asks
LibreOffice to update the indexes first, through its scripting bridge.

That bridge needs the `uno` module, which ships inside LibreOffice rather than
with the system Python. If it is not importable the script falls back to a plain
conversion and says clearly that the contents page will be empty.

  macOS    brew install --cask libreoffice
           then run with LibreOffice's own Python for a filled contents page:
           /Applications/LibreOffice.app/Contents/Resources/python report/to_pdf.py <file>
  Linux    apt install libreoffice  (python3-uno is usually included)

Either way, opening the .docx in Word and pressing "Update field" on the
contents, then exporting to PDF, gives the same result.
"""
from __future__ import annotations

import shutil
import subprocess
import sys
import time
from pathlib import Path

PORT = 2002


def soffice_binary() -> str:
    for candidate in ("soffice", "libreoffice",
                      "/Applications/LibreOffice.app/Contents/MacOS/soffice"):
        if shutil.which(candidate) or Path(candidate).exists():
            return candidate
    raise SystemExit("LibreOffice was not found. Install it, or export the PDF from Word instead.")


def convert_plain(paths: list[Path], binary: str) -> None:
    out_dir = paths[0].parent
    subprocess.run([binary, "--headless", "--convert-to", "pdf", "--outdir", str(out_dir),
                    *[str(p) for p in paths]], check=True)
    print("Converted without updating fields: the contents page will be empty.")
    print("Open the .docx in Word, right-click the contents and choose 'Update field', "
          "then export to PDF — or re-run this script with LibreOffice's own Python.")


def convert_with_index(paths: list[Path], binary: str) -> None:
    import uno  # noqa: PLC0415  (only importable from LibreOffice's Python)
    from com.sun.star.beans import PropertyValue  # noqa: PLC0415

    def prop(name: str, value) -> PropertyValue:
        p = PropertyValue()
        p.Name, p.Value = name, value
        return p

    server = subprocess.Popen([binary, "--headless", "--invisible", "--norestore",
                               f"--accept=socket,host=localhost,port={PORT};urp;"])
    ctx = None
    local = uno.getComponentContext()
    resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
    for _ in range(40):
        try:
            ctx = resolver.resolve(
                f"uno:socket,host=localhost,port={PORT};urp;StarOffice.ComponentContext")
            break
        except Exception:
            time.sleep(0.5)
    if ctx is None:
        server.terminate()
        raise SystemExit("LibreOffice did not start in 20 seconds.")

    desktop = ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)
    try:
        for path in paths:
            src = path.resolve()
            doc = desktop.loadComponentFromURL(uno.systemPathToFileUrl(str(src)), "_blank", 0,
                                               (prop("Hidden", True),))
            n_indexes = 0
            for _ in range(2):          # twice: page numbers settle after the first pass
                indexes = doc.getDocumentIndexes()
                n_indexes = indexes.getCount()
                for i in range(n_indexes):
                    indexes.getByIndex(i).update()
                doc.refresh()
            out = src.with_suffix(".pdf")
            doc.storeToURL(uno.systemPathToFileUrl(str(out)), (prop("FilterName", "writer_pdf_Export"),))
            doc.close(True)
            print(f"wrote {out}  ({n_indexes} contents field updated)")
    finally:
        try:
            desktop.terminate()
        except Exception:
            pass
        try:
            server.wait(timeout=20)
        except Exception:
            server.terminate()


def main(argv: list[str]) -> int:
    paths = [Path(a) for a in argv]
    if not paths:
        here = Path(__file__).resolve().parent
        paths = sorted(here.glob("*.docx"))
    missing = [p for p in paths if not p.exists()]
    if missing:
        raise SystemExit(f"not found: {', '.join(str(m) for m in missing)}")
    if not paths:
        raise SystemExit("no .docx files to convert")

    binary = soffice_binary()
    try:
        import uno  # noqa: F401
    except ImportError:
        convert_plain(paths, binary)
    else:
        convert_with_index(paths, binary)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
