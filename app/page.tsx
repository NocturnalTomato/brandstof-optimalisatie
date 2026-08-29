export default function Home() {
  return (
    <main
      style={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "48px 24px",
      }}
    >
      <header style={{ marginBottom: 64 }}>
        <h1 className="figure" style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>
          Brandstof
        </h1>
      </header>

      <div
        style={{
          width: 2,
          minHeight: 200,
          background: "var(--line)",
          position: "relative",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 14,
            height: 14,
            borderRadius: "50%",
            border: "2px solid var(--node)",
            background: "var(--bg)",
          }}
        />
      </div>
    </main>
  );
}
