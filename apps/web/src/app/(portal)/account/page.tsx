export default function AccountPage() {
  return (
    <>
      <header className="page-heading">
        <h1>Account</h1>
        <p>Profile, organization membership, roles, and plan settings.</p>
      </header>
      <section className="panel">
        <h2>Account setup pending</h2>
        <p className="muted">
          Account controls will use database-backed roles and permissions after
          sign-in is connected.
        </p>
      </section>
    </>
  );
}
