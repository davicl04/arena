import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, request } from '../api/client'
import type { User } from '../api/client'
import { AuthBrand } from '@/components/auth/AuthBrand'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Eyebrow } from '@/components/ui/eyebrow'
import { feedbackVariants } from '@/components/ui/feedback'
import { toast, Toaster } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { startOfToday, toDateKey } from '@/utils/dateKey'

/** Alternância entre entrar e criar conta. */
const modes = [
  { register: false, label: 'Entrar' },
  { register: true, label: 'Criar conta' },
] as const
/** Rótulo de campo sobre o fundo escuro. */
const label = 'text-heading'
/** Texto de ajuda abaixo de um campo. */
const help = 'mt-1.5 text-[11px] leading-[1.6] text-ink-muted'

const SESSION_EXPIRED_TEXT = 'Sua sessão expirou. Entre novamente para continuar.'
const BIRTH_DATE_REQUIRED = 'Informe a data de nascimento.'

/** Hoje e o mês atual de 18 anos atrás (onde o calendário abre sem data escolhida), como "2026-11-24" e "2008-11-01". */
function birthDateBounds() {
  const today = startOfToday()
  return { today: toDateKey(today), adultMonth: toDateKey(new Date(today.getFullYear() - 18, today.getMonth(), 1)) }
}

/*
 * Tela de entrada Dividida, escura por design nos dois temas (`escuro-por-design`): a metade da marca (`AuthBrand`) e a
 * metade do formulário, sem cartão. Estados da tela, separados: `expired` (a sessão acabou no meio do uso: só o aviso,
 * a pessoa entra de novo) e `notice` (a leitura de `/me` ao abrir o aplicativo falhou: a mensagem e "Tentar conexão
 * novamente", que refaz a leitura). Os erros de entrar e criar conta ficam no formulário; no login, a recusa de
 * credenciais (401) marca e-mail e senha como inválidos. Só a confirmação do cadastro vira toast. Esta tela não tem a
 * folha nem a faixa de conexão: o próprio "Tentar conexão novamente" cobre a falha. A falha de conexão do login ou do
 * cadastro (`isConnection`) não repete a mensagem no formulário: sobe por `onConnectionFailure` e liga o mesmo bloco
 * de `notice`. A data de nascimento vem do `DatePicker` (mês e ano por listas) e é obrigatória antes do envio; a idade
 * mínima continua sendo regra do servidor.
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
  const [credentialError, setCredentialError] = useState(false)
  const [birthDate, setBirthDate] = useState('')
  const [birthDateMissing, setBirthDateMissing] = useState(false)
  const bounds = birthDateBounds()

  function switchMode(next: boolean) {
    setRegister(next)
    setError('')
    setCredentialError(false)
    setBirthDate('')
    setBirthDateMissing(false)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (register && !birthDate) {
      setBirthDateMissing(true)
      event.currentTarget.querySelector<HTMLElement>('#birth_date')?.focus()
      return
    }
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email')).trim()
    const password = String(form.get('password'))
    setBusy(true)
    setError('')
    setCredentialError(false)
    try {
      if (register) {
        await request('/auth/register', 'POST', {
          name: form.get('name'),
          email,
          password,
          birth_date: birthDate,
        })
        switchMode(false)
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
      setCredentialError(!register && err instanceof ApiError && err.status === 401)
      setError(err instanceof Error ? err.message : 'Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  const credentialProps = credentialError ? { 'aria-invalid': true, 'aria-describedby': 'auth-error' } : {}
  return (
    <>
      <main
        id="main"
        className="escuro-por-design grid min-h-dvh grid-cols-[1.05fr_1fr] bg-app entrada-estreita:grid-cols-1 entrada-estreita:grid-rows-[auto_1fr]"
      >
        <AuthBrand register={register} />
        <div className="flex min-w-0 flex-col items-center justify-center px-[clamp(16px,4vw,48px)] py-10 entrada-estreita:justify-start entrada-estreita:pt-7">
          <section className="w-full max-w-[420px]" aria-labelledby="auth-title">
            <Eyebrow className="uppercase">Bem-vindo à Arena</Eyebrow>
            <h2 id="auth-title" className="my-1.5 text-[22px] tracking-[-0.03em]">
              {register ? 'Comece sua jornada' : 'Bom ter você aqui'}
            </h2>
            <p className="text-[13px] leading-[1.6] text-ink-muted">
              {register
                ? 'Uma conta. Três maneiras de se movimentar.'
                : 'Entre para cuidar do seu perfil esportivo.'}
            </p>
            {expired && (
              <p className={cn(feedbackVariants({ tone: 'warning' }), 'border border-solid border-warning/20')} role="alert">
                {SESSION_EXPIRED_TEXT}
              </p>
            )}
            {notice && (
              <div className={cn(feedbackVariants(), 'border border-solid border-error/20')} role="alert">
                {notice}
                <Button variant="text" type="button" onClick={onRetry}>
                  Tentar conexão novamente
                </Button>
              </div>
            )}
            <div className="mt-5 mb-1.5 flex rounded-field bg-white/5 p-1" role="group" aria-label="Entrar ou criar conta">
              {modes.map((mode) => (
                <button
                  key={mode.label}
                  type="button"
                  className="min-h-10 flex-1 rounded-[8px] border-0 bg-transparent text-[12px] font-bold text-ink hover:bg-hover aria-pressed:bg-legend aria-pressed:text-on-legend"
                  aria-pressed={register === mode.register}
                  disabled={busy}
                  onClick={() => switchMode(mode.register)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <form onSubmit={submit} key={register ? 'register' : 'login'}>
              <fieldset disabled={busy}>
                {register && (
                  <>
                    <label htmlFor="name" className={label}>Nome completo</label>
                    <input
                      id="name"
                      name="name"
                      autoComplete="name"
                      required
                      minLength={2}
                      maxLength={100}
                      placeholder="Como podemos chamar você?"
                    />
                    <label htmlFor="birth_date" className={label}>Data de nascimento</label>
                    <DatePicker
                      id="birth_date"
                      label="Data de nascimento"
                      tone="dark"
                      captionLayout="dropdown"
                      popupClassName="escuro-por-design"
                      value={birthDate}
                      onChange={(value) => {
                        setBirthDate(value)
                        setBirthDateMissing(false)
                      }}
                      max={bounds.today}
                      defaultMonth={bounds.adultMonth}
                      invalid={birthDateMissing}
                      aria-describedby={birthDateMissing ? 'birth-date-error age-help' : 'age-help'}
                    />
                    {birthDateMissing && (
                      <small id="birth-date-error" className="mt-1.5 text-[11px] font-semibold text-error" role="alert">
                        {BIRTH_DATE_REQUIRED}
                      </small>
                    )}
                    <small id="age-help" className={help}>
                      A Arena é para pessoas com 18 anos completos ou mais.
                    </small>
                  </>
                )}
                <label htmlFor="email" className={label}>E-mail</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  placeholder="voce@exemplo.com"
                  className="aria-invalid:border-error"
                  {...credentialProps}
                />
                <label htmlFor="password" className={label}>Senha</label>
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
                  className="aria-invalid:border-error"
                  {...credentialProps}
                />
                {register && (
                  <small id="password-help" className={help}>
                    Use entre 10 e 128 caracteres.
                  </small>
                )}
                {error && (
                  <p id="auth-error" className={cn(feedbackVariants(), 'border border-solid border-error/20')} role="alert">
                    {error}
                  </p>
                )}
                <Button type="submit" className="mt-[22px] h-[52px] w-full text-[15px]">
                  {busy ? 'Aguarde…' : register ? 'Criar minha conta' : 'Entrar na Arena'}
                </Button>
              </fieldset>
            </form>
            <p className="mt-4 text-center text-[11px] leading-[1.7] text-ink-muted">
              Seu perfil começa privado. Você controla os dados da sua trajetória.
            </p>
          </section>
        </div>
      </main>
      <Toaster />
    </>
  )
}
