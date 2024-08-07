import assert from "assert"
import { Repo, DocHandle, DocumentId } from "@automerge/automerge-repo"

// import { next as A } from "@automerge/automerge"

const repo = new Repo()

interface TestDoc {
  foo: string
  bar?: string
  baz?: string
}

const handle = repo.create<TestDoc>()

const putPatch = (obj: any, p: A.PutPatch) => {
  const { path, value } = p
  if (path.length === 0) return value

  const tail = path.pop()
  const local = path.reduce((acc, next) => acc[next], obj)
  local[tail] = value
  return obj
}

// with updating a single field in a deep object
// we want to avoid replacing the entire object but we do need to replace
// parents along the path to avoid mutation
// in this code we use immutable es6 style
const deepObjectUpdate = <T>(obj: T, path: A.Prop[], updater: (any) => any) => 
  path.reduce((acc, next, i) => {
    if (i === path.length - 1) {
      acc[next] = updater(acc[next])
      return obj
    }
    return { ...acc, [next]: { ...acc[next] } }
  }, obj)


  

const splicePatch = (obj: any, p: A.SpliceTextPatch) => {
  const { path, value } = p
  
  const pos = path.pop() as number
  const tail = path.pop()
  const local = path.reduce((acc, next) => acc[next], obj)

  const prefix = local[tail].substring(0, pos)
  const suffix = local[tail].slice(pos)
  
  local[tail] = prefix + value + suffix
  return obj
}

const delPatch = (obj: any, p: A.DelPatch) => {
  const { path, length } = p
  const tail = path.pop()
  const local = path.reduce((acc, next) => acc[next], obj)
  // TODO: support length
  delete local[tail]
  return obj
}

const insertPatch = (obj: any, p: A.InsertPatch) => {
  const { path, values } = p
  const pos = path.pop()
  const tail = path.pop()
  const local = path.reduce((acc, next) => acc[next], obj)
  local[tail].splice(pos, 0, ...values)
  return obj
}

const applyPatches = (obj: any, ps: A.Patch[]) => {
  return ps.reduce((acc, p) => applyPatch(acc, p), obj)
}

const applyPatch = (obj: any, p: A.Patch) => {
  console.log('ptch', obj, p)
  switch (p.action) {
    case "put":
      return putPatch(obj, p);
    case "splice":
      return splicePatch(obj, p);
    case "del":
      return delPatch(obj, p);
    case "insert":
      return insertPatch(obj, p);
    case "inc":
    case "mark":
    case "unmark":
    case "conflict":
      throw new Error(`Patch action not implemented.\n${JSON.stringify(p, undefined, 2)}`)
  }
}
const pojo = {}

/* returns an updated set of patches that only materializes a subdocument based on a provided path */
const scopeToSubtree = (patches: A.Patch[], path: A.Prop[]) => {
  const scopedPatches = patches.map(p => {
    const newPath = p.path.slice()
    if (newPath.length === 0) return p
    if (newPath[0] !== path[0]) return
    newPath.shift()
    const newPatch = { ...p, path: newPath }
    console.log("newPatch", newPatch)
    return newPatch
  })
  return scopedPatches.filter(Boolean) as A.Patch[]
}

handle.on("change", ({ handle, doc, patches }) => {
  console.log(patches)
  // const scopedPatches = scopeToSubtree(patches, ["baz"])
  applyPatches(pojo, patches)
  console.log({pojo})
})

handle.change(doc => {
  doc.foo = "zero"
  doc.baz = [{number: "ONE"}]
})

handle.change(doc => {
  doc.foo = "one"
  doc.baz.push({number: "TWO"})
})


handle.change(doc => {
  doc.baz = [ { whammo: "blammo" }]
})

handle.change(doc => {
  A.splice(doc, ["foo"], 3, 0, "three")
})

handle.change(doc => {
  A.splice(doc, ["foo"], 3, 0, "two")
})

handle.change(doc => {
  doc = { oh: "no" }
})
handle.change(doc => {
  doc.ah = "no"
})

console.log({pojo, doc: handle.docSync()})
assert.deepStrictEqual(pojo, handle.docSync())
