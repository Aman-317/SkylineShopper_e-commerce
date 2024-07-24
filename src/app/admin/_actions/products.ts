"use server"

import db from "@/db/db"
import { z } from "zod"
import fs from "fs/promises"
import { notFound, redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

const blobSchema = z.instanceof(Blob, { message: "Required" })

// No direct size or type checks for Blob, so you may want to add your custom validation here
const addSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  priceInCents: z.coerce.number().int().min(1),
  file: blobSchema,
  image: blobSchema,
})

export async function addProduct(prevState: unknown, formData: FormData) {
  const result = addSchema.safeParse(Object.fromEntries(formData.entries()))
  if (result.success === false) {
    return result.error.formErrors.fieldErrors
  }

  const data = result.data

  // Generate random UUID for filenames
  const fileId = crypto.randomUUID()
  const imageId = crypto.randomUUID()

  const filePath = `products/${fileId}`
  const imagePath = `/products/${imageId}`

  // Write files without file.name (using IDs instead)
  await fs.mkdir("products", { recursive: true })
  await fs.writeFile(filePath, Buffer.from(await data.file.arrayBuffer()))

  await fs.mkdir("public/products", { recursive: true })
  await fs.writeFile(
    `public${imagePath}`,
    Buffer.from(await data.image.arrayBuffer())
  )

  await db.product.create({
    data: {
      isAvailableForPurchase: false,
      name: data.name,
      description: data.description,
      priceInCents: data.priceInCents,
      filePath,
      imagePath,
    },
  })

  revalidatePath("/")
  revalidatePath("/products")

  redirect("/admin/products")
}

const editSchema = addSchema.extend({
  file: blobSchema.optional(),
  image: blobSchema.optional(),
})

export async function updateProduct(
  id: string,
  prevState: unknown,
  formData: FormData
) {
  const result = editSchema.safeParse(Object.fromEntries(formData.entries()))
  if (result.success === false) {
    return result.error.formErrors.fieldErrors
  }

  const data = result.data
  const product = await db.product.findUnique({ where: { id } })

  if (product == null) return notFound()

  let filePath = product.filePath
  if (data.file != null) {
    await fs.unlink(product.filePath)
    const fileId = crypto.randomUUID()
    filePath = `products/${fileId}`
    await fs.writeFile(filePath, Buffer.from(await data.file.arrayBuffer()))
  }

  let imagePath = product.imagePath
  if (data.image != null) {
    await fs.unlink(`public${product.imagePath}`)
    const imageId = crypto.randomUUID()
    imagePath = `/products/${imageId}`
    await fs.writeFile(
      `public${imagePath}`,
      Buffer.from(await data.image.arrayBuffer())
    )
  }

  await db.product.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
      priceInCents: data.priceInCents,
      filePath,
      imagePath,
    },
  })

  revalidatePath("/")
  revalidatePath("/products")

  redirect("/admin/products")
}

export async function toggleProductAvailability(
  id: string,
  isAvailableForPurchase: boolean
) {
  await db.product.update({ where: { id }, data: { isAvailableForPurchase } })

  revalidatePath("/")
  revalidatePath("/products")
}

export async function deleteProduct(id: string) {
  const product = await db.product.delete({ where: { id } })

  if (product == null) return notFound()

  await fs.unlink(product.filePath)
  await fs.unlink(`public${product.imagePath}`)

  revalidatePath("/")
  revalidatePath("/products")
}
