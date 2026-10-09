import { BundleGate } from '../content/BundleGate'
import SearchScreen from '../search/SearchScreen'

export default function SearchRoute() {
  return <BundleGate render={(bundle) => <SearchScreen bundle={bundle} />} />
}
