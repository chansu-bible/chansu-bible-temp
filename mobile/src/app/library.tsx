import { BundleGate } from '../content/BundleGate'
import LibraryScreen from '../library/LibraryScreen'

export default function LibraryRoute() {
  return <BundleGate render={(bundle) => <LibraryScreen bundle={bundle} />} />
}
