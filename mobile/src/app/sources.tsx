import { BundleGate } from '../content/BundleGate'
import SourcesScreen from '../sources/SourcesScreen'

export default function SourcesRoute() {
  return <BundleGate render={(bundle) => <SourcesScreen bundle={bundle} />} />
}
