"use client";
import { useState, useRef } from "react";
import { jsPDF } from "jspdf";
import "./styles.css";

interface ImageItem {
  id: string;
  name: string;
  size: number;
  type: string;
  width: number;
  height: number;
  url: string;
}

function UploadArea() {
  const [highlight, setHighlight] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pdfResult, setPdfResult] = useState("");
  const [imgList, setImgList] = useState<ImageItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragItemIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isInsertBefore, setIsInsertBefore] = useState<boolean>(true);
  const [activeMoveId, setActiveMoveId] = useState<string | null>(null);

  function formatFileSize(size: number) {
    const KB = 1024;
    const MB = 1024 * KB;
    const GB = 1024 * MB;

    if (size >= GB) return `${(size / GB).toFixed(2)} GB`;
    if (size >= MB) return `${(size / MB).toFixed(2)} MB`;
    if (size >= KB) return `${(size / KB).toFixed(2)} KB`;
    return `${size} B`;
  }

  function getResolution(file: File): Promise<{ width: number; height: number }> {
    const img = new window.Image();
    const src = URL.createObjectURL(file);
    img.src = src;

    return new Promise((resolve) => {
      img.onload = () => {
        URL.revokeObjectURL(src);
        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      };
    });
  }

  async function addToList(imgs: File[]) {
    Promise.all(
      imgs.map(async (i) => {
        const { width, height } = await getResolution(i);
        return {
          id: window.crypto.randomUUID
            ? window.crypto.randomUUID()
            : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
                const r = (Math.random() * 16) | 0;
                const v = c === "x" ? r : (r & 0x3) | 0x8;
                return v.toString(16);
              }),
          name: i.name,
          size: i.size,
          type: i.type,
          width,
          height,
          url: URL.createObjectURL(i),
        };
      })
    ).then((newFiles) => {
      setImgList((prev) => [...prev, ...newFiles]);
    });
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setHighlight(false);
    const dt = e.dataTransfer;
    const files = Array.from(dt.files);
    addToList(files);
  }

  async function generatePdf() {
    if (imgList.length == 0) return;

    setIsGenerating(true);
    setPdfResult("");

    await new Promise((r) => setTimeout(r, 50)); // Wait for the render

    const pdf = new jsPDF({
      orientation: imgList[0].width > imgList[0].height ? "l" : "p",
      unit: "px",
      format: [imgList[0].width, imgList[0].height],
    });
    pdf.addImage(imgList[0].url, "JPEG", 0, 0, imgList[0].width, imgList[0].height);

    for (let i = 1; i < imgList.length; i++) {
      const img = imgList[i];
      pdf.addPage([img.width, img.height], img.width > img.height ? "l" : "p");
      pdf.addImage(img.url, "JPEG", 0, 0, img.width, img.height);
    }

    const res = pdf.output("bloburl");
    setPdfResult(String(res));
    pdf.save("result.pdf");
    setIsGenerating(false);
  }

  const handleDragStart = (e: React.MouseEvent, index: number) => {
    const tr = (e.target as HTMLElement).closest("tr");
    if (tr) {
      tr.setAttribute("draggable", "true");
      dragItemIndex.current = index;

      tr.ondragend = () => {
        tr.removeAttribute("draggable");
        dragItemIndex.current = null;
        setDragOverIndex(null);
      };
    }
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragItemIndex.current === null) return;

    const targetTr = e.currentTarget as HTMLTableRowElement;
    const rect = targetTr.getBoundingClientRect();
    const before = e.clientY - rect.top < rect.height / 2;

    setDragOverIndex(index);
    setIsInsertBefore(before);
  };

  const handleDrop = (index: number) => {
    if (dragItemIndex.current === null) return;

    let targetIndex = index;
    if (!isInsertBefore) {
      targetIndex = index + 1;
    }

    if (dragItemIndex.current !== targetIndex && dragItemIndex.current !== targetIndex - 1) {
      const newList = [...imgList];
      const targetItem = newList.splice(dragItemIndex.current, 1)[0];

      const insertAt = dragItemIndex.current < targetIndex ? targetIndex - 1 : targetIndex;
      newList.splice(insertAt, 0, targetItem);
      setImgList(newList);
    }

    dragItemIndex.current = null;
    setDragOverIndex(null);
  };

  const handleDelete = (id: string, url: string) => {
    setImgList((prev) => prev.filter((item) => item.id !== id));
    URL.revokeObjectURL(url);
  };

  const handleRowTapMove = (targetIndex: number) => {
    if (!activeMoveId) return;

    const sourceIndex = imgList.findIndex((item) => item.id === activeMoveId);
    if (sourceIndex === -1 || sourceIndex === targetIndex) {
      setActiveMoveId(null);
      return;
    }

    const newList = [...imgList];
    const [targetItem] = newList.splice(sourceIndex, 1);

    const insertIndex = sourceIndex < targetIndex ? targetIndex : targetIndex + 1;

    newList.splice(insertIndex, 0, targetItem);

    setImgList(newList);
    setActiveMoveId(null);
  };

  return (
    <>
      <div
        className={`i2p-drop-area ${highlight ? "highlight" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setHighlight(true);
        }}
        onDragLeave={() => setHighlight(false)}
        onDrop={handleFileDrop}
      >
        <button
          type="button"
          className="i2p-input-btn"
          disabled={isGenerating}
          onClick={() => inputRef.current?.click()}
        >
          {isGenerating ? "Generating..." : "Select Files"}
        </button>
      </div>
      <input
        type="file"
        className="i2p-input"
        multiple={true}
        ref={inputRef}
        accept="image/png, image/jpeg, image/webp"
        onChange={(e) => e.target.files && addToList(Array.from(e.target.files))}
      />
      {imgList.length > 0 && (
        <>
          <div className="pdf-status">
            <button
              className="generate-btn"
              type="button"
              onClick={generatePdf}
              disabled={isGenerating}
            >
              {isGenerating ? "Generating..." : "Generate"}
            </button>
            {pdfResult && (
              <p>
                Successfully generated!
                <br /> Download should have begun, or click{" "}
                <a href={pdfResult} target="_blank" download="result.pdf">
                  here
                </a>{" "}
                to download.
              </p>
            )}
          </div>
          <table className="i2p-img-list">
            <thead>
              <tr>
                <th>Name</th>
                <th>Thumbnail</th>
                <th>Type</th>
                <th>Size</th>
                <th>Resolution</th>
                <th>Operations</th>
              </tr>
            </thead>
            <tbody>
              {imgList.map((i, idx) => {
                let dragClassName = "";
                if (dragOverIndex === idx) {
                  dragClassName = isInsertBefore ? "drag-before" : "drag-after";
                }
                const isAnyRowMoving = activeMoveId !== null;
                const isCurrentRowMoving = activeMoveId === i.id;

                return (
                  <tr
                    key={i.id}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={() => handleDrop(idx)}
                    onTouchStart={(e) => {
                      e.currentTarget.setAttribute("draggable", "true");
                    }}
                    onTouchEnd={(e) => e.currentTarget.removeAttribute("draggable")}
                    onClick={() => {
                      if (isAnyRowMoving) {
                        handleRowTapMove(idx);
                      }
                    }}
                    className={`sortable-row ${dragClassName} ${isCurrentRowMoving ? "row-moving-active" : ""} ${isAnyRowMoving && !isCurrentRowMoving ? "row-move-target" : ""}`}
                  >
                    <td>{i.name}</td>
                    <td>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img alt={i.name} src={i.url}></img>
                    </td>
                    <td>{i.type}</td>
                    <td>{formatFileSize(i.size)}</td>
                    <td>
                      {i.width} x {i.height}
                    </td>

                    <td>
                      <div className="ops-container">
                        {!isAnyRowMoving && (
                          <span
                            className="drag-handle"
                            title="Drag to reorder"
                            onMouseDown={(e) => handleDragStart(e, idx)}
                            onMouseUp={(e) => {
                              (
                                e.currentTarget as HTMLElement
                              ).parentElement?.parentElement?.parentElement?.removeAttribute(
                                "draggable"
                              );
                            }}
                          >
                            ☰
                          </span>
                        )}

                        {!isAnyRowMoving ? (
                          <button
                            type="button"
                            className="move-trigger-btn"
                            onClick={() => {
                              setActiveMoveId(i.id);
                            }}
                          >
                            Move
                          </button>
                        ) : isCurrentRowMoving ? (
                          <button
                            type="button"
                            className="move-cancel-btn"
                            onClick={() => {
                              setActiveMoveId(null);
                            }}
                          >
                            Cancel
                          </button>
                        ) : (
                          <span className="move-target-text">🡇 Put Under</span>
                        )}

                        <button
                          type="button"
                          className="delete-btn"
                          onClick={() => handleDelete(i.id, i.url)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

export default function Convert() {
  return (
    <div className="container">
      <div>
        <div className="convert-title">Image to PDF</div>
        <div>Assemble images to single pdf</div>
      </div>
      <UploadArea />
    </div>
  );
}
