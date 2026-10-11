import { apiUrl } from '../api/client'

/** Foto de perfil de uma conta da comunidade, com iniciais quando não há imagem. */
export function SocialPhoto({ path, name, className = '' }: { path: string | null; name: string; className?: string }) {
  return path ? <img className={`social-avatar ${className}`} src={apiUrl(path)} alt={`Foto de ${name}`} /> :
    <span className={`social-avatar social-initials ${className}`} aria-label={name}>{name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</span>
}
