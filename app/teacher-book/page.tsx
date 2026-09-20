import type { Metadata } from "next";
import "./style.css";

export const metadata: Metadata = {
  title: "老師的書｜林阿嫂",
  description: "林阿嫂老師的書籍購買通路",
};

const stores = [
  { name: "誠品", note: "誠品線上書店", url: "https://reurl.cc/vLxnbe" },
  { name: "博客來", note: "博客來網路書店", url: "https://reurl.cc/jrede1" },
  { name: "金石堂", note: "金石堂網路書店", url: "https://reurl.cc/Omob37" },
  { name: "讀冊", note: "TAAZE 讀冊生活", url: "https://reurl.cc/K9o6Yn" },
];

export default function TeacherBookPage() {
  return (
    <main className="teacherBookPage">
      <section className="teacherBookCard">
        <header className="teacherBookHeader">
          <div className="teacherBookIcon" aria-hidden="true">
            <span>書</span>
          </div>
          <div>
            <p>林阿嫂老師</p>
            <h1>老師的書</h1>
          </div>
        </header>

        <div className="teacherBookIntro">
          <span aria-hidden="true">✦</span>
          <div>
            <h2>親切提醒</h2>
            <p>老師的書購買通路如下，您可以選擇方便的平台前往查看。</p>
          </div>
        </div>

        <nav className="teacherBookStores" aria-label="書籍購買通路">
          {stores.map((store, index) => (
            <a href={store.url} target="_blank" rel="noopener noreferrer" key={store.name}>
              <span className="teacherBookStoreNumber">{String(index + 1).padStart(2, "0")}</span>
              <span className="teacherBookStoreText">
                <strong>{store.name}</strong>
                <small>{store.note}</small>
              </span>
              <span className="teacherBookArrow" aria-hidden="true">前往 →</span>
            </a>
          ))}
        </nav>

        <footer className="teacherBookFooter">
          <span aria-hidden="true">❦</span>
          <p>謝謝您的支持</p>
          <small>請以各購書平台顯示的庫存與售價為準</small>
        </footer>
      </section>
    </main>
  );
}
