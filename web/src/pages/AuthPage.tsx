import { useState } from 'react'
import type { FormEvent } from 'react'
import { request } from '../api/client'
import type { User } from '../api/client'
import { Logo } from '../components/Brand'

export default function AuthPage({
  onLogin,
  notice,
  onRetry,
}: {
  onLogin: (user: User) => void
  notice: string
  onRetry: () => void
}) {
  const [register, setRegister] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email')).trim()
    const password = String(form.get('password'))
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      if (register) {
        await request('/auth/register', 'POST', {
          name: form.get('name'),
          email,
          password,
          birth_date: form.get('birth_date'),
        })
        setRegister(false)
        setSuccess('Conta criada. Entre com seu e-mail e senha.')
        return
      }
      const session = await request<{ user: User }>('/auth/login', 'POST', {
        email,
        password,
      })
      onLogin(session.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tente novamente.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <main id="main" className="auth-layout">
      <section className="intro">
        <Logo />
        <p className="eyebrow">SEU ESPORTE, SUA HISTÓRIA</p>
        <h1>Bora jogar?</h1>
        <p className="intro-copy">
          Futebol, tênis e corrida. Seu próximo encontro começa no Arena.
        </p>
        <div className="sport-pills">
          <span>Futebol</span>
          <span>Tênis</span>
          <span>Corrida</span>
        </div>
      </section>
      <section className="auth-panel" aria-labelledby="auth-title">
        <p className="eyebrow">BEM-VINDO AO ARENA</p>
        <h2 id="auth-title">
          {register ? 'Comece sua jornada' : 'Bom ter você aqui'}
        </h2>
        <p className="muted">
          {register
            ? 'Uma conta. Três maneiras de se movimentar.'
            : 'Entre para cuidar do seu perfil esportivo.'}
        </p>
        <div className="switcher">
          <button
            type="button"
            aria-pressed={!register}
            disabled={busy}
            onClick={() => {
              setRegister(false)
              setError('')
              setSuccess('')
            }}
          >
            Entrar
          </button>
          <button
            type="button"
            aria-pressed={register}
            disabled={busy}
            onClick={() => {
              setRegister(true)
              setError('')
              setSuccess('')
            }}
          >
            Criar conta
          </button>
        </div>
        {notice && (
          <div className="notice" role="alert">
            {notice}
            <button type="button" className="text-button" onClick={onRetry}>
              Tentar conexão novamente
            </button>
          </div>
        )}
        <form onSubmit={submit} key={register ? 'register' : 'login'}>
          <fieldset disabled={busy}>
            {register && (
              <>
                <label htmlFor="name">Nome completo</label>
                <input
                  id="name"
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="Como podemos chamar você?"
                />
                <label htmlFor="birth_date">Data de nascimento</label>
                <input
                  id="birth_date"
                  name="birth_date"
                  type="date"
                  required
                  max={new Date().toISOString().slice(0, 10)}
                  aria-describedby="age-help"
                />
                <small id="age-help">
                  O Arena é para pessoas com 18 anos completos ou mais.
                </small>
              </>
            )}
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              placeholder="voce@exemplo.com"
            />
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={register ? 'new-password' : 'current-password'}
              minLength={register ? 10 : 1}
              maxLength={128}
              required
              aria-describedby={register ? 'password-help' : undefined}
              placeholder={register ? 'Pelo menos 10 caracteres' : 'Sua senha'}
            />
            {register && (
              <small id="password-help">Use entre 10 e 128 caracteres.</small>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {success && (
              <p className="success" role="status">
                {success}
              </p>
            )}
            <button className="primary" type="submit">
              {busy
                ? 'Aguarde…'
                : register
                  ? 'Criar minha conta →'
                  : 'Entrar no Arena →'}
            </button>
          </fieldset>
        </form>
        <p className="privacy-note">
          Seu perfil começa privado. Você controla os dados da sua trajetória.
        </p>
      </section>
    </main>
  )
}
