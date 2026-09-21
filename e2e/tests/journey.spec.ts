import { expect, test } from '@playwright/test'

const shots = (name: string) => `screenshots/${name}.png`
const email = `patient-${Date.now()}@example.com`

test.describe.configure({ mode: 'serial' })

test('patient journey: sign up → onboarding → plan → log → swap → food check → progress', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('One plate')
  await page.screenshot({ path: shots('01-landing'), fullPage: true })

  await page.getByRole('link', { name: 'Get started' }).click()
  await page.getByLabel('Your name').fill('Lakshmi')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/onboarding/)

  // Step 1 - about you
  await page.getByLabel('Age (years)').fill('58')
  await page.getByLabel('Height (cm)').fill('157')
  await page.getByLabel('Weight (kg)').fill('74')
  await page.getByLabel(/Waist \(cm\)/).fill('92')
  await page.screenshot({ path: shots('02-onboarding-about'), fullPage: true })
  await page.getByRole('button', { name: 'Next' }).click()

  // Step 2 - food and region
  await page.getByLabel('Home state').selectOption('Tamil Nadu')
  await expect(page.getByText('Your food region: South')).toBeVisible()
  await page.getByLabel('peanut').check()
  await page.screenshot({ path: shots('03-onboarding-food'), fullPage: true })
  await page.getByRole('button', { name: 'Next' }).click()

  // Step 3 - conditions
  await page.getByLabel('Diabetes', { exact: true }).check()
  await page.getByLabel('High blood pressure', { exact: true }).check()
  await page.getByLabel('Kidney disease', { exact: true }).check()
  await page.getByLabel('Stage (if you know it)').selectOption('3')
  await page.screenshot({ path: shots('04-onboarding-conditions'), fullPage: true })
  await page.getByRole('button', { name: 'Next' }).click()

  // Step 4 - medicines
  await page.getByPlaceholder('Search medicines').fill('metformin')
  await page.getByLabel('Metformin', { exact: true }).check()
  await page.getByPlaceholder('Search medicines').fill('telmi')
  await page.getByLabel('Telmisartan', { exact: true }).check()
  await expect(page.getByText('2 selected')).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()

  // Step 5 - tests
  await page.getByLabel(/^Creatinine/).fill('1.4')
  await page.getByLabel(/^Potassium/).fill('5.3')
  await page.getByLabel(/^Top number/).fill('148')
  await page.getByLabel(/^Bottom number/).fill('90')
  await page.getByLabel(/^HbA1c/).fill('8.2')
  await page.screenshot({ path: shots('05-onboarding-tests'), fullPage: true })
  await page.getByRole('button', { name: 'Save and make my plan' }).click()

  await expect(page).toHaveURL(/today/, { timeout: 120_000 })
  await expect(page.getByRole('heading', { name: "Today's meals" })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Breakfast' })).toBeVisible()
  await expect(page.getByText("Today's limits")).toBeVisible()
  await page.screenshot({ path: shots('06-today'), fullPage: true })

  // log a meal
  await page.getByRole('button', { name: 'Ate it' }).first().click()
  await expect(page.getByText('Eaten').first()).toBeVisible()

  // swap a dish
  const before = await page.locator('article').nth(1).locator('li').nth(1).locator('span').first().innerText()
  await page.locator('article').nth(1).getByRole('button', { name: 'Change dish' }).nth(1).click()
  await expect(page.getByText('Finding another dish…')).toHaveCount(0, { timeout: 60_000 })
  const after = await page.locator('article').nth(1).locator('li').nth(1).locator('span').first().innerText()
  expect(after).not.toEqual(before)

  // week page with explanations
  await page.getByRole('link', { name: 'Week' }).first().click()
  await expect(page.getByRole('heading', { name: 'Your week' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'How clashing advice was settled' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your daily limits' })).toBeVisible()
  await page.getByRole('tab').nth(3).click()
  await page.screenshot({ path: shots('07-week'), fullPage: true })

  // food check in Tamil script
  await page.getByRole('link', { name: 'Food check' }).first().click()
  await page.getByPlaceholder('e.g. idli, rajma, banana').fill('இளநீர்')
  await page.getByRole('button', { name: /Tender coconut water/ }).click()
  await expect(page.getByText('Avoid').first()).toBeVisible()
  await expect(page.getByText('Coconut water is very high in potassium.')).toBeVisible()
  await page.screenshot({ path: shots('08-food-check'), fullPage: true })

  // progress: add a weight result
  await page.getByRole('link', { name: 'Progress' }).first().click()
  await page.getByLabel('Test').selectOption('weight')
  await page.getByLabel('Value').fill('73.5')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Saved. Make a new plan so it uses this result.')).toBeVisible()
  await expect(page.getByText('What your results say')).toBeVisible()
  await page.screenshot({ path: shots('09-progress'), fullPage: true })

  // switch to Tamil
  await page.getByRole('button', { name: 'தமிழ்' }).click()
  await expect(page.getByRole('link', { name: 'இன்று' }).first()).toBeVisible()
  await page.getByRole('link', { name: 'இன்று' }).first().click()
  await expect(page.getByRole('heading', { name: 'இன்றைய உணவுகள்' })).toBeVisible()
  await page.screenshot({ path: shots('10-today-tamil'), fullPage: true })

  // Hindi
  await page.getByRole('button', { name: 'हिंदी' }).click()
  await expect(page.getByRole('heading', { name: 'आज का खाना' })).toBeVisible()
  await page.getByRole('button', { name: 'English' }).click()

  // mobile layout
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.getByRole('heading', { name: "Today's meals" })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await page.screenshot({ path: shots('11-today-mobile'), fullPage: false })

  // profile persists and sign out works
  await page.getByRole('link', { name: 'Profile' }).last().click()
  await expect(page.getByLabel('Home state')).toHaveValue('Tamil Nadu')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/login/)

  expect(errors, errors.join('\n')).toEqual([])
})

test('returning patient signs in and sees the saved plan', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: "Today's meals" })).toBeVisible()
})

test('wrong password shows a clear message', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('not-the-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toContainText('Email or password is not correct.')
})

test('admin console', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@mediplate.in')
  await page.getByLabel('Password').fill('ChangeMe!2026')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('link', { name: 'Admin' }).first().click()
  await expect(page.getByRole('heading', { name: 'Admin console' })).toBeVisible()
  await expect(page.getByText('Regional dishes')).toBeVisible()
  await page.screenshot({ path: shots('12-admin'), fullPage: false })
})

test('unknown page shows a way back', async ({ page }) => {
  await page.goto('/nope-not-here')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
})
