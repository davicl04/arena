import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, request } from '../api/client'
import type { User } from '../api/client'
import { Logo } from '../components/Brand'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Eyebrow } from '@/components/ui/eyebrow'
import { feedbackVariants } from '@/components/ui/feedback'
import { toast, Toaster } from '@/components/ui/toast'

/** Alternância entre entrar e criar conta. */
const modes = [
  { register: false, label: 'Entrar' },
  { register: true, label: 'Criar conta' },
] as const
/** Texto de ajuda abaixo de um campo. */
const help = 'mt-[7px] text-[10px] leading-[1.6] text-ink-muted'

const SESSION_EXPIRED_TEXT = 'Sua sessão expirou. Entre novamente para continuar.'

/*
 * Estados da tela de entrada, separados: `expired` (a sessão acabou no meio do uso: só o aviso, a pessoa entra de novo) e
 * `notice` (a leitura de `/me` ao abrir o aplicativo falhou: a mensagem e "Tentar conexão novamente", que refaz a leitura).
 * Os erros de entrar e criar conta ficam no formulário; só a confirmação do cadastro vira toast. Esta tela não tem a folha
 * nem a faixa de conexão: o próprio "Tentar conexão novamente" cobre a falha. A falha de conexão do login ou do cadastro
 * (`isConnection`) não repete a mensagem no formulário: sobe por `onConnectionFailure` e liga o mesmo bloco de `notice`.
 */
export default function AuthPage({
  onLogin,
  expired = false,
  notice,
  onRetry,
  onConnectionFailure,
}: {
  onLogin: (user: User) => void
  /** A sessão expirou: mostra o aviso, sem nova tentativa de conexão. */
  expired?: boolean
  /** Falha de conexão (ou outro erro) ao ler `/me` na abertura; vazio se não houve. */
  notice: string
  onRetry: () => void
  /** Entrar ou criar conta falhou por conexão: o aplicativo liga o bloco `notice`, e o formulário não repete a mensagem. */
  onConnectionFailure: (message: string) => void
}) {
  const [register, setRegister] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email')).trim()
    const password = String(form.get('password'))
    setBusy(true)
    setError('')
    try {
      if (register) {
        await request('/auth/register', 'POST', {
          name: form.get('name'),
          email,
          password,
          birth_date: form.get('birth_date'),
        })
        setRegister(false)
        toast.success('Conta criada.', { description: 'Entre com seu e-mail e senha.' })
        return
      }
      const session = await request<{ user: User }>('/auth/login', 'POST', {
        email,
        password,
      })
      onLogin(session.user)
    } catch (err) {
      if (err instanceof ApiError && err.isConnection) {
        onConnectionFailure(err.message)
        return
      }
      setError(err instanceof Error ? err.message : 'Tente novamente.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
    <main
      id="main"
      className="m-auto min-h-dvh max-w-[440px] px-6 py-10 app-narrow:px-5 app-narrow:py-7"
    >
      <section>
        <Logo className="mb-9" />
        <Eyebrow className="mb-2">SEU ESPORTE, SUA HISTÓRIA</Eyebrow>
        <h1 className="text-[32px] leading-[1.25]">Bora jogar?</h1>
        <p className="my-3 text-[13px] leading-[1.7] text-ink-muted">
          Futebol, tênis e corrida. Seu próximo encontro começa no Arena.
        </p>
        <div className="mt-[18px] mb-6 flex gap-[7px]">
          {['Futebol', 'Tênis', 'Corrida'].map((sport) => (
            <span
              key={sport}
              className="rounded-[18px] border border-solid border-line px-3 py-[7px] text-[10px] font-semibold"
            >
              {sport}
            </span>
          ))}
        </div>
      </section>
      <Card
        as="section"
        className="rounded-[20px] p-[23px] app-narrow:p-[22px]"
        aria-labelledby="auth-title"
      >
        <Eyebrow className="mb-2 text-[9px]">BEM-VINDO AO ARENA</Eyebrow>
        <h2 id="auth-title" className="mb-2 text-[20px]">
          {register ? 'Comece sua jornada' : 'Bom ter você aqui'}
        </h2>
        <p className="text-[12px] leading-[1.6] text-ink-muted">
          {register
            ? 'Uma conta. Três maneiras de se movimentar.'
            : 'Entre para cuidar do seu perfil esportivo.'}
        </p>
        <div className="my-5 flex rounded-field bg-app p-1 noite:bg-[#ffffff0d]">
          {modes.map((mode) => (
            <button
              key={mode.label}
              type="button"
              className="min-h-10 flex-1 rounded-[8px] border-0 bg-transparent text-[12px] font-bold aria-pressed:bg-white aria-pressed:text-brand aria-pressed:shadow-soft noite:aria-pressed:bg-legend noite:aria-pressed:text-[#1a1404]"
              aria-pressed={register === mode.register}
              disabled={busy}
              onClick={() => {
                setRegister(mode.register)
                setError('')
              }}
            >
              {mode.label}
            </button>
          ))}
        </div>
        {expired && (
          <p className={feedbackVariants()} role="alert">
            {SESSION_EXPIRED_TEXT}
          </p>
        )}
        {notice && (
          <div className={feedbackVariants()} role="alert">
            {notice}
            <Button variant="text" type="button" onClick={onRetry}>
              Tentar conexão novamente
            </Button>
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
                <small id="age-help" className={help}>
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
              <small id="password-help" className={help}>
                Use entre 10 e 128 caracteres.
              </small>
            )}
            {error && (
              <p className={feedbackVariants()} role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="mt-[22px] h-[52px] w-full">
              {busy
                ? 'Aguarde…'
                : register
                  ? 'Criar minha conta →'
                  : 'Entrar no Arena →'}
            </Button>
          </fieldset>
        </form>
        <p className="mt-[18px] text-center text-[10px] leading-[1.7] text-ink-muted">
          Seu perfil começa privado. Você controla os dados da sua trajetória.
        </p>
      </Card>
    </main>
    <Toaster />
    </>
  )
}
