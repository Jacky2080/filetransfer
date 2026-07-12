import "./styles.css";

export default function Convert() {
  return (
    <div className="container">
      <div>
        <div className="convert-title">File Converter</div>
        <div>Convert files between different types</div>
      </div>
      <div className="convert-links">
        <div className="convert-link">
          <a href="img2pdf">Image to pdf</a>
          <div>Assemble images to single pdf</div>
        </div>
      </div>
    </div>
  );
}
