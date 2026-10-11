import { BundleGate } from '../content/BundleGate'
import HomeScreen from '../home/HomeScreen'

export default function IndexRoute() {
  return <BundleGate render={(bundle) => <HomeScreen bundle={bundle} />} />
}
