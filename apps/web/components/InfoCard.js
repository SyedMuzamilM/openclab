export default function InfoCard({ title, description, bullets, pills }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {bullets && bullets.length ? (
        <ul>
          {bullets.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {pills && pills.length ? (
        <div className="pill-row">
          {pills.map(item => (
            <span className="pill" key={item}>
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
