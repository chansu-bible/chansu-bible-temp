import { BundleGate } from '../content/BundleGate'
import ReaderScreen from '../reader/ReaderScreen'

export default function ReadRoute() {
  return <BundleGate render={(bundle) => <ReaderScreen bundle={bundle} />} />
}
