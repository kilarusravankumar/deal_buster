
interface ThumbnailProps {
  thumbnail: string
}
export default function Thumbnail({ thumbnail }: ThumbnailProps) {

  return (
    <image source={thumbnail} protocol="auto" style={{ width: 15, height: 5, }}>
    </image>
  )
}
