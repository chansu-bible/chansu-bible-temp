import { BundleGate } from '../content/BundleGate'
import GenealogyScreen from '../people/GenealogyScreen'

export default function GenealogyRoute() {
  return <BundleGate render={(bundle) => <GenealogyScreen bundle={bundle} />} />
}
