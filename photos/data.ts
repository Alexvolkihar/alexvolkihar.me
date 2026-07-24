export interface PhotoExif {
  camera: string
  /** 35mm equivalent, rounded */
  focalLength?: number
  /** Actual focal length as reported by the lens, rounded. Only set when it differs from the 35mm equivalent. */
  focalLengthReal?: number
  fNumber?: number
  /** As reported by EXIF, e.g. `1/40`, `0.8`, `2` */
  exposureTime?: string
  iso?: number
}

export interface PhotoMate {
  text?: string
  lang?: string
  blurhash?: string
  exif?: PhotoExif
}

export interface Photo extends PhotoMate {
  name: string
  url: string
}

const metaInfo = Object.entries(
  import.meta.glob<PhotoMate>('./**/*.json', {
    eager: true,
    import: 'default',
  }),
).map(([name, data]) => {
  name = name.replace(/\.\w+$/, '').replace(/^\.\//, '')
  return {
    name,
    data,
  }
})

const photos = Object.entries(
  import.meta.glob<string>('./**/*.{jpg,png,JPG,PNG}', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
)
  .map(([name, url]): Photo => {
    name = name.replace(/\.\w+$/, '').replace(/^\.\//, '')
    return {
      ...metaInfo.find(info => info.name === name)?.data,
      name,
      url,
    }
  })
  .sort((a, b) => b.name.localeCompare(a.name))

export default photos
