/**
 * Gestionnaire de médias d'un véhicule :
 *  - glisser-déposer / sélection multiple ;
 *  - validation des formats, tailles et dimensions côté navigateur ;
 *  - compression des grosses images avant envoi (canvas) ;
 *  - prévisualisation des fichiers avant publication ;
 *  - barre de progression de l'upload ;
 *  - suppression et réordonnancement des photos enregistrées.
 */
import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { FiArrowLeft, FiArrowRight, FiFilm, FiImage, FiTrash2, FiUploadCloud, FiX } from 'react-icons/fi'
import { fmtBytes } from '../utils/format'

export const MIN_PHOTOS = 4
export const MAX_PHOTOS = 12
const MAX_PHOTO = 10 * 1024 * 1024
const MAX_VIDEO = 20 * 1024 * 1024
const IMG_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const VID_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve({ img, url })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Image illisible'))
    }
    img.src = url
  })
}

/** Redimensionne les images volumineuses (> 2400 px ou > 1,5 Mo) en JPEG qualité 0,88. */
async function compress(file, img) {
  const max = 2400
  if (file.size < 1.5 * 1024 * 1024 && img.width <= max && img.height <= max) return file
  const ratio = Math.min(1, max / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * ratio)
  canvas.height = Math.round(img.height * ratio)
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.88))
  if (!blob || blob.size >= file.size) return file
  return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' })
}

/**
 * props :
 *  existing  : médias enregistrés { photos: [], video }
 *  pending   : fichiers en attente [{ id, file, url, type, originalSize }]
 *  setPending
 *  onDelete(mediaId), onReorder(ids)
 *  progress  : 0..100 | null pendant l'upload
 */
export default function MediaManager({ existing = { photos: [], video: null }, pending, setPending, onDelete, onReorder, progress, disabled }) {
  const input = useRef()
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const photosCount = existing.photos.length + pending.filter((p) => p.type === 'photo').length
  const hasVideo = Boolean(existing.video) || pending.some((p) => p.type === 'video')

  const addFiles = async (list) => {
    setBusy(true)
    const next = []
    let photos = photosCount
    let video = hasVideo
    for (const file of Array.from(list)) {
      if (IMG_TYPES.includes(file.type)) {
        if (photos >= MAX_PHOTOS) {
          toast.error(`${MAX_PHOTOS} photos maximum`)
          continue
        }
        if (file.size > MAX_PHOTO * 2) {
          toast.error(`${file.name} : image trop volumineuse`)
          continue
        }
        try {
          const { img, url } = await loadImage(file)
          if (img.width < 400 || img.height < 300) {
            toast.error(`${file.name} : 400×300 pixels minimum`)
            URL.revokeObjectURL(url)
            continue
          }
          const out = await compress(file, img)
          if (out.size > MAX_PHOTO) {
            toast.error(`${file.name} : 10 Mo maximum`)
            continue
          }
          next.push({ id: crypto.randomUUID(), file: out, url, type: 'photo', originalSize: file.size, width: img.width, height: img.height })
          photos++
        } catch {
          toast.error(`${file.name} : fichier image invalide`)
        }
      } else if (VID_TYPES.includes(file.type)) {
        if (video) {
          toast.error('Une seule vidéo par véhicule')
          continue
        }
        if (file.size > MAX_VIDEO) {
          toast.error(`${file.name} : la vidéo dépasse 20 Mo (${fmtBytes(file.size)})`)
          continue
        }
        next.push({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file), type: 'video', originalSize: file.size })
        video = true
      } else {
        toast.error(`${file.name} : format non supporté (JPG, PNG, WEBP, MP4, MOV, WEBM)`)
      }
    }
    setPending((p) => [...p, ...next])
    setBusy(false)
  }

  const removePending = (id) =>
    setPending((p) => {
      const it = p.find((x) => x.id === id)
      if (it) URL.revokeObjectURL(it.url)
      return p.filter((x) => x.id !== id)
    })

  const move = (idx, dir) => {
    const ids = existing.photos.map((p) => p.id)
    const j = idx + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[idx], ids[j]] = [ids[j], ids[idx]]
    onReorder(ids)
  }

  const missing = Math.max(0, MIN_PHOTOS - photosCount)

  return (
    <div>
      <div
        className={`dropzone ${drag ? 'drag' : ''}`}
        onClick={() => !disabled && input.current.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          if (!disabled) addFiles(e.dataTransfer.files)
        }}
      >
        <div className="dz-icon">{busy ? <FiUploadCloud className="spin" /> : <FiUploadCloud />}</div>
        <div className="strong">Glissez vos photos et votre vidéo ici</div>
        <div className="small muted">
          ou cliquez pour parcourir · Photos JPG/PNG/WEBP (10 Mo max, compressées automatiquement) · 1 vidéo MP4/MOV/WEBM (20 Mo max)
        </div>
        <input ref={input} type="file" hidden multiple accept={[...IMG_TYPES, ...VID_TYPES].join(',')} onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
      </div>

      <div className="row between mt-2 small">
        <span>
          <b>{photosCount}</b> / {MIN_PHOTOS} photos obligatoires {photosCount > MIN_PHOTOS && <span className="muted">(+{photosCount - MIN_PHOTOS} supplémentaire(s), {MAX_PHOTOS} max)</span>}
        </span>
        <span className="muted">{hasVideo ? 'Vidéo ajoutée' : 'Vidéo facultative'}</span>
      </div>
      <div className={`progress mt-1 ${missing === 0 ? 'green' : ''}`}>
        <div style={{ width: `${Math.min(100, (photosCount / MIN_PHOTOS) * 100)}%` }} />
      </div>

      {progress != null && (
        <div className="callout mt-2">
          <FiUploadCloud />
          <div style={{ flex: 1 }}>
            Envoi des fichiers… {progress}%
            <div className="progress mt-1"><div style={{ width: `${progress}%` }} /></div>
          </div>
        </div>
      )}

      <div className="media-grid">
        {existing.photos.map((p, i) => (
          <div key={p.id} className="media-item">
            <img src={p.thumbUrl || p.url} alt="" />
            <span className="mi-tag">{i === 0 ? 'Couverture' : `Photo ${i + 1}`}</span>
            {!disabled && (
              <div className="mi-actions">
                <button type="button" title="Déplacer à gauche" onClick={() => move(i, -1)} disabled={i === 0}><FiArrowLeft /></button>
                <button type="button" title="Déplacer à droite" onClick={() => move(i, 1)} disabled={i === existing.photos.length - 1}><FiArrowRight /></button>
                <button type="button" title="Supprimer" onClick={() => onDelete(p.id)} style={{ color: 'var(--red)' }}><FiTrash2 /></button>
              </div>
            )}
          </div>
        ))}
        {existing.video && (
          <div className="media-item">
            <video src={existing.video.url} muted controls preload="metadata" />
            <span className="mi-tag"><FiFilm /> Vidéo · {fmtBytes(existing.video.sizeBytes)}</span>
            {!disabled && (
              <div className="mi-actions">
                <button type="button" title="Supprimer" onClick={() => onDelete(existing.video.id)} style={{ color: 'var(--red)' }}><FiTrash2 /></button>
              </div>
            )}
          </div>
        )}
        {pending.map((p) => (
          <div key={p.id} className="media-item pending">
            {p.type === 'photo' ? <img src={p.url} alt="" /> : <video src={p.url} muted controls preload="metadata" />}
            <span className="mi-tag">
              {p.type === 'video' ? <FiFilm /> : <FiImage />} À envoyer · {fmtBytes(p.file.size)}
              {p.file.size < p.originalSize && ` (−${Math.round((1 - p.file.size / p.originalSize) * 100)}%)`}
            </span>
            {progress == null && (
              <div className="mi-actions">
                <button type="button" title="Retirer" onClick={() => removePending(p.id)}><FiX /></button>
              </div>
            )}
            {progress != null && <div className="mi-progress"><div style={{ width: `${progress}%` }} /></div>}
          </div>
        ))}
        {Array.from({ length: missing }).map((_, i) => (
          <div key={`slot-${i}`} className="media-item slot-empty" onClick={() => !disabled && input.current.click()} style={{ cursor: 'pointer' }}>
            <div><FiImage style={{ fontSize: 22 }} /><br />Photo {photosCount + i + 1} requise</div>
          </div>
        ))}
      </div>
    </div>
  )
}
