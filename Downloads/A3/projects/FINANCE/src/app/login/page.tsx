import { login } from "./actions";

type LoginPageProps = { searchParams: Promise<{ error?: string }> };

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <main className="login-page">
      <section className="login-card">
        <p style={{ margin: 0, color: "#2563eb", fontWeight: 900 }}>A3 MANAGEMENT</p>
        <h1>Company Login</h1>
        <p className="subtitle">Phase 0 company foundation</p>
        {params.error ? <div className="notice error">{params.error}</div> : null}
        <form action={login}>
          <label className="field">
            <span>Email</span>
            <input type="email" name="email" autoComplete="email" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" name="password" autoComplete="current-password" required />
          </label>
          <button className="button primary" type="submit">Sign In</button>
        </form>
      </section>
    </main>
  );
}
