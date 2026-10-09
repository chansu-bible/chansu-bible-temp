import { BundleGate } from '../content/BundleGate'
import PlayerScreen from '../player/PlayerScreen'

export default function PlayerRoute() {
  return <BundleGate render={(bundle) => <PlayerScreen bundle={bundle} />} />
}
