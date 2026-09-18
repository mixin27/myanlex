export default function LoginPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <p className="muted">MyanLex developer portal</p>
        <h1 id="login-title">Sign in</h1>
        <p className="muted">
          Account authentication will be connected before the portal accepts
          real developer data.
        </p>
        <form>
          <label>
            Email
            <input type="email" name="email" autoComplete="email" disabled />
          </label>
          <button className="button" type="submit" disabled>
            Continue
          </button>
        </form>
      </section>
    </main>
  );
}
