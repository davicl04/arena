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
import { reportActionError } from "../hooks/useSubmit";
import SportIcon from "./SportIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { feedbackVariants } from "@/components/ui/feedback";
import { toast } from "@/components/ui/toast";
import { IconTile } from "@/components/ui/icon-tile";

export default function SportCard({
  sport,
  label,
  description,
  profile,
  cities,
  onSave,
  onExpired,
}: {
  sport: Sport;
  label: string;
  symbol: string;
  description: string;
  profile?: Profile;
  cities: City[];
  onSave: (sport: Sport, input: ProfileInput) => Promise<void>;
  onExpired: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
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
      toast.success("Perfil salvo.");
    } catch (err) {
      // Só a recusa de campos (422) fica no formulário; o resto vira toast ou aviso de conexão.
      const report = reportActionError(err, "Não foi possível salvar o perfil. Tente novamente.", onExpired);
      if (report.kind === "form") setError(report.message);
    } finally {
      setBusy(false);
    }
  }
  const city = cities.find((c) => c.id === profile?.city_id);
  return (
    <Card as="article" radius="panel" className="p-[17px]">
      <div className="mb-3 flex items-center justify-between">
        <IconTile>
          <SportIcon sport={sport} size={30} />
        </IconTile>
        <Badge>{profile ? "Perfil ativo" : "Comece aqui"}</Badge>
      </div>
      <h3 className="mb-[5px] text-[18px]">{label}</h3>
      <p className="text-[11px] leading-[1.6] text-ink-muted">{description}</p>
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
            <label className="flex items-center gap-[9px] leading-[1.5] font-normal">
              <input
                className="mt-[3px] mr-[3px] mb-[3px] ml-1 size-[18px] shrink-0 accent-brand"
                type="checkbox"
                name="looking_for"
                defaultChecked={profile?.looking_for}
              />
              Estou procurando oportunidades
            </label>
            {error && (
              <p className={feedbackVariants()} role="alert">
                {error}
              </p>
            )}
            <div className="mt-5 flex gap-2">
              <Button type="submit">
                {busy ? "Salvando…" : "Salvar perfil"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditing(false)}
              >
                Cancelar
              </Button>
            </div>
          </fieldset>
        </form>
      ) : (
        <>
          <dl className="my-[18px]">
            <Fact
              term="Cidade"
              value={city ? `${city.name} · ${city.state}` : "A definir"}
            />
            <Fact term="Nível" value="Sem classificação" />
            {profile && (
              <Fact
                term="Disponibilidade"
                value={
                  profile.looking_for
                    ? "Procurando oportunidades"
                    : "Sem procura ativa"
                }
              />
            )}
            {profile?.position && (
              <Fact
                term="Posição"
                value={positions.find((p) => p.value === profile.position)?.label}
              />
            )}
          </dl>
          <Button
            variant="secondary"
            className="w-full justify-between"
            disabled={!cities.length}
            onClick={() => {
              setEditing(true);
              setError("");
            }}
          >
            {profile ? "Editar perfil" : `Adicionar ${label.toLowerCase()}`}{" "}
            <span aria-hidden="true">↗</span>
          </Button>
        </>
      )}
    </Card>
  );
}

/** Linha da ficha do perfil esportivo (termo à esquerda, valor à direita). */
function Fact({ term, value }: { term: string; value?: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line py-[9px] text-[11px]">
      <dt className="text-ink-muted">{term}</dt>
      <dd className="m-0 text-right">{value}</dd>
    </div>
  );
}
