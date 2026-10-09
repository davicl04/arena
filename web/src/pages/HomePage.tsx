import { Bell, CalendarDays, ChevronRight, Medal, Zap } from "lucide-react";
import { sports } from "../api/client";
import type { Profile } from "../api/client";
import { Logo } from "../components/Brand";
import { cover, sportIcons } from "../data/arena";
import type { Screen } from "../data/arena";

export default function HomePage({
  firstName,
  profiles,
  loading,
  go,
}: {
  firstName: string;
  profiles: Profile[];
  loading: boolean;
  go: (screen: Screen) => void;
}) {
  return (
    <>
      <header className="home-header">
        <Logo />
        <div className="header-actions">
          <button
            className="icon-btn"
            aria-label="Notificações"
            onClick={() => go("notifications")}
          >
            <Bell size={21} />
          </button>
        </div>
      </header>
      <section className="greeting">
        <p>
          {new Date().toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
        <h1>Bora jogar, {firstName}?</h1>
      </section>
      <div className="section-title">
        <h2>Seu elo</h2>
        <button onClick={() => go("ranking")}>Ver elos</button>
      </div>
      {loading ? (
        <p role="status">Carregando modalidades…</p>
      ) : (
        <div className="rank-carousel">
          {sports.map((s) => {
            const Icon = sportIcons[s.value];
            const profile = profiles.find((p) => p.sport === s.value);
            return (
              <article key={s.value} className="rank-card">
                <div className="rank-card-top">
                  <span className="sport-icon">
                    <Icon size={30} />
                  </span>
                  <span className="badge">
                    {profile?.level || "Sem classificação"}
                  </span>
                </div>
                <p>{s.label}</p>
                <div className="rank-score">
                  <strong>—</strong>
                  <span>pontos</span>
                </div>
                <div className="progress" />
                <div className="rank-meta">
                  <span>
                    {profile
                      ? "Sua trajetória começa aqui"
                      : "Adicione seu perfil esportivo"}
                  </span>
                  <button onClick={() => go("sports")}>
                    {profile ? "Ver perfil" : "Configurar"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <button className="primary main-cta" onClick={() => go("play")}>
        <Zap size={20} fill="currentColor" />
        Encontrar partida
      </button>
      <div className="section-title">
        <h2>Próxima partida</h2>
      </div>
      <article className="match-card">
        <span className="date-box">
          <CalendarDays size={23} />
        </span>
        <div>
          <h3>Nenhuma partida agendada</h3>
          <p>Seu próximo encontro aparecerá aqui.</p>
        </div>
      </article>
      <div className="section-title">
        <h2>Perto de você</h2>
        <button onClick={() => go("sports")}>Minha cidade</button>
      </div>
      <div className="champ-feature">
        <img src={cover} alt="Esporte ao ar livre ao pôr do sol" />
        <span className="image-overlay" />
        <div className="champ-copy">
          <span className="eyebrow">VIVA O ESPORTE</span>
          <strong>Sua próxima arena</strong>
          <small>
            {profiles.length
              ? "Novas atividades em breve."
              : "Configure sua cidade e suas modalidades."}
          </small>
        </div>
      </div>
      <div className="section-title">
        <h2>Seu próximo passo</h2>
      </div>
      <button className="challenge-card" onClick={() => go("sports")}>
        <span className="sport-icon">
          <Medal size={22} />
        </span>
        <span>
          <b>Complete seu perfil esportivo</b>
          <small>Mostre onde e como você gosta de jogar.</small>
        </span>
        <ChevronRight size={19} />
      </button>
    </>
  );
}
