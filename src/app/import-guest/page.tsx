export default function ImportGuestPage() {
  return (
    <main
      style={{
        maxWidth: 560,
        margin: "48px auto",
        padding: 16,
        lineHeight: 1.5,
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>Import your guest data?</h1>

      <p style={{ marginBottom: 20 }}>
        You created budgeting data before signing in. Would you like to import it
        into your account?
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <form action="/api/anon/import" method="post">
          <button
            type="submit"
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #ccc",
              cursor: "pointer",
            }}
          >
            Import guest data
          </button>
        </form>

        <form action="/api/anon/discard" method="post">
          <button
            type="submit"
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #ccc",
              cursor: "pointer",
              background: "transparent",
            }}
          >
            Don’t import
          </button>
        </form>
      </div>

      <p style={{ marginTop: 18, opacity: 0.8 }}>
        You can keep using the app either way.
      </p>
    </main>
  );
}
