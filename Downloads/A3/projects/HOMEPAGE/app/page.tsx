const businesses = [
  {
    eyebrow: "NIGHTLIFE",
    title: "Sakura Entertainment",
    description: "Premium nightlife, live entertainment, drink promotions and table reservations.",
    href: "https://sakura.a3group.sg",
    link: "Visit Sakura",
  },
  {
    eyebrow: "TRANSPORT",
    title: "AEJKY Limousine",
    description: "Airport transfers, private chauffeur journeys, hourly disposal and Singapore–Johor transport.",
    href: "https://limousine.a3group.sg",
    link: "Book a Journey",
  },
  {
    eyebrow: "FOOD & DINING",
    title: "A3 Food",
    description: "Quality food concepts, local favourites and convenient dining experiences under A3 Group.",
    href: "https://food.a3group.sg",
    link: "Explore A3 Food",
  },
];

export default function HomePage() {
  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#home" aria-label="A3 Group home">
          <span className="mark">A3</span>
          <span><strong>A3 GROUP</strong><small>SINGAPORE</small></span>
        </a>
        <nav>
          <a href="#businesses">Businesses</a>
          <a href="#about">About</a>
          <a className="contact" href="mailto:contact@a3group.sg">Contact</a>
        </nav>
      </header>

      <section className="hero" id="home">
        <div className="glow glowOne" />
        <div className="glow glowTwo" />
        <div className="heroCopy">
          <p className="eyebrow"><span /> A SINGAPORE BUSINESS GROUP</p>
          <h1>Distinct businesses.<br /><em>One trusted group.</em></h1>
          <p className="lead">A3 Group brings together premium nightlife, professional chauffeured transport and quality food experiences.</p>
          <div className="actions">
            <a className="primary" href="#businesses">Explore Our Businesses <b>→</b></a>
            <a className="secondary" href="mailto:contact@a3group.sg">Contact A3 Group</a>
          </div>
        </div>
        <div className="heroPanel">
          <div className="panelMark">A3</div>
          <p>Connected by quality, service and dependable operations.</p>
          <div className="panelStats">
            <span><strong>03</strong><small>Core Businesses</small></span>
            <span><strong>SG</strong><small>Based in Singapore</small></span>
          </div>
        </div>
      </section>

      <section className="businessSection" id="businesses">
        <div className="sectionTitle">
          <div><p className="eyebrow dark"><span /> OUR BUSINESSES</p><h2>Choose your destination.</h2></div>
          <p>Each business has its own dedicated website and service experience.</p>
        </div>
        <div className="cards">
          {businesses.map((business, index) => (
            <a className="card" href={business.href} key={business.title}>
              <span className="number">0{index + 1}</span>
              <p>{business.eyebrow}</p>
              <h3>{business.title}</h3>
              <div>{business.description}</div>
              <strong>{business.link} <b>↗</b></strong>
            </a>
          ))}
        </div>
      </section>

      <section className="about" id="about">
        <div className="aboutTitle"><p className="eyebrow"><span /> ABOUT A3 GROUP</p><h2>Built for service.<br />Managed for growth.</h2></div>
        <div className="aboutText"><p>A3 Group supports customer-facing businesses with clear branding, responsive service and structured operations.</p><p>Our dedicated websites keep each business focused while maintaining one professional group identity.</p></div>
      </section>

      <footer>
        <a className="brand footerBrand" href="#home"><span className="mark">A3</span><span><strong>A3 GROUP</strong><small>SINGAPORE</small></span></a>
        <p>© {new Date().getFullYear()} A3 Group. All rights reserved.</p>
        <div><a href="https://sakura.a3group.sg">Sakura</a><a href="https://limousine.a3group.sg">Limousine</a><a href="https://food.a3group.sg">Food</a></div>
      </footer>
    </main>
  );
}
