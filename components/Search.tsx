"use client";
import { useState, useMemo, type Dispatch, type SetStateAction } from "react";

export default function Search({
  fileList,
  setDate,
}: {
  fileList: { name: string }[];
  setDate: Dispatch<SetStateAction<string>>;
}) {
  const [searchText, setSearchText] = useState("");
  const [reg, setReg] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const files = useMemo(() => {
    return fileList.map((f) => {
      const parts = f.name.split("/");
      const date = parts.shift()!;
      return { date, name: parts.join("/") };
    });
  }, [fileList]);

  const list = useMemo(() => {
    if (!searchText) return [];
    try {
      if (reg) {
        const regText = new RegExp(searchText, "i");
        return files.filter((f) => regText.test(f.name));
      }
      return files.filter((f) => f.name.toLowerCase().includes(searchText.toLowerCase()));
    } catch {
      return [];
    }
  }, [searchText, reg, files]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (list.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev < list.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : list.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < list.length) {
        const selected = list[activeIndex];
        setDate(selected.date);
        setSearchText("");
      }
    }
  };

  return (
    <div className="search-container">
      <div className={`search-box ${list && list.length > 0 ? "search-content" : ""}`}>
        <input
          type="text"
          className="search-input"
          placeholder="Search files"
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
        ></input>
        <button
          title="Use Reg Expression"
          className={`reg-btn ${reg ? "selected" : ""}`}
          type="button"
          onClick={() => {
            setReg(!reg);
          }}
        >
          .*
        </button>
      </div>
      {searchText && list.length > 0 && (
        <ul className="search-result">
          {list.map((f, idx) => (
            <li
              key={`${f.date}/${f.name}`}
              className={idx === activeIndex ? "active" : ""}
              onClick={() => {
                setDate(f.date!);
                setSearchText("");
              }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              <span className="file-name">{f.name}</span>
              <span className="date">{f.date}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
