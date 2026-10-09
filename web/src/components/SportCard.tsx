import { useState } from "react";
import type { FormEvent } from "react";
import { positions } from "../api/client";
import type {
  City,
  Profile,
  ProfileInput,
  Sport,
  Position,
} from "../api/client";
import SportIcon from "./SportIcon";

export default function SportCard({
  sport,
  label,
  description,
  profile,
  cities,
  onSave,
}: {
  sport: Sport;
  label: string;
  symbol: string;
  description: string;
  profile?: Profile;
  cities: City[];
  onSave: (sport: Sport, input: ProfileInput) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await onSave(sport, {
        city_id: Number(form.get("city_id")),
        position:
          sport === "futebol"
            ? ((form.get("position") || null) as Position | null)
            : null,
        looking_for: form.get("looking_for") === "on",
      });
      setEditing(false);
      setMessage("Perfil salvo.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  const city = cities.find((c) => c.id === profile?.city_id);
  return (
    <article className={`sport-card ${sport}`}>
      <div className="card-top">
        <span className="sport-icon">
          <SportIcon sport={sport} size={30} />
        </span>
        <span className="badge">
          {profile ? "Perfil ativo" : "Comece aqui"}
        </span>
      </div>
      <h3>{label}</h3>
      <p className="muted">{description}</p>
      {editing ? (
        <form onSubmit={save}>
          <fieldset disabled={busy}>
            <label htmlFor={`${sport}-city`}>Cidade</label>
            <select
              id={`${sport}-city`}
              name="city_id"
              required
              defaultValue={profile?.city_id || ""}
            >
              <option value="" disabled>
                Selecione uma cidade
              </option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.state}
                </option>
              ))}
            </select>
            {sport === "futebol" && (
              <>
                <label htmlFor={`${sport}-position`}>Posição preferida</label>
                <select
                  id={`${sport}-position`}
                  name="position"
                  defaultValue={profile?.position || ""}
                >
                  <option value="">Ainda não definida</option>
                  {positions.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </>
            )}
            <label className="checkbox">
              <input
                type="checkbox"
                name="looking_for"
                defaultChecked={profile?.looking_for}
              />
              Estou procurando oportunidades
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button className="primary" type="submit">
                {busy ? "Salvando…" : "Salvar perfil"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setEditing(false)}
              >
                Cancelar
              </button>
            </div>
          </fieldset>
        </form>
      ) : (
        <>
          <dl>
            <div>
              <dt>Cidade</dt>
              <dd>{city ? `${city.name} · ${city.state}` : "A definir"}</dd>
            </div>
            <div>
              <dt>Nível</dt>
              <dd>Sem classificação</dd>
            </div>
            {profile && (
              <div>
                <dt>Disponibilidade</dt>
                <dd>
                  {profile.looking_for
                    ? "Procurando oportunidades"
                    : "Sem procura ativa"}
                </dd>
              </div>
            )}
            {profile?.position && (
              <div>
                <dt>Posição</dt>
                <dd>
                  {positions.find((p) => p.value === profile.position)?.label}
                </dd>
              </div>
            )}
          </dl>
          <button
            className="secondary card-action"
            disabled={!cities.length}
            onClick={() => {
              setEditing(true);
              setMessage("");
              setError("");
            }}
          >
            {profile ? "Editar perfil" : `Adicionar ${label.toLowerCase()}`}{" "}
            <span aria-hidden="true">↗</span>
          </button>
        </>
      )}
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
    </article>
  );
}
