/**
 * A recorded tour of the interface, used to review the motion design.
 * Not part of the test suite: run it with DEMO=1 npx playwright test demo
 * and the video appears under e2e/test-results/.
 */
import { expect, test } from '@playwright/test'

const email = `demo-${Date.now()}@example.com`
const beat = (page: import('@playwright/test').Page, ms = 900) => page.waitForTimeout(ms)

test.use({ video: { mode: 'on', size: { width: 1280, height: 800 } }, viewport: { width: 1280, height: 800 } })

test('interface tour', async ({ page }) => {
  test.skip(!process.env.DEMO, 'set DEMO=1 to record the tour')
  test.setTimeout(300_000)

  // Landing: heading, body and illustration animate in.
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('One plate')
  await beat(page, 2200)
  await page.mouse.move(640, 620)
  await page.getByRole('heading', { name: 'Food from home' }).scrollIntoViewIfNeeded()
  await beat(page, 1400)
  await page.mouse.move(300, 560)
  await beat(page, 700)

  // Sign up.
  await page.getByRole('link', { name: 'Get started' }).click()
  await beat(page, 700)
  await page.getByLabel('Your name').fill('Lakshmi')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('password123')
  await beat(page, 500)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/onboarding/)
  await beat(page, 900)

  // Onboarding: the step bar fills and each step slides in.
  await page.getByLabel('Age (years)').fill('58')
  await page.getByLabel('Height (cm)').fill('157')
  await page.getByLabel('Weight (kg)').fill('74')
  await page.getByLabel(/Waist \(cm\)/).fill('92')
  await beat(page, 600)
  await page.getByRole('button', { name: 'Next' }).click()
  await beat(page, 900)
  await page.getByLabel('Home state').selectOption('Tamil Nadu')
  await expect(page.getByText('Your food region: South')).toBeVisible()
  await beat(page, 900)
  await page.getByLabel('peanut').check()
  await beat(page, 600)
  await page.getByRole('button', { name: 'Next' }).click()
  await beat(page, 800)
  await page.getByLabel('Diabetes', { exact: true }).check()
  await beat(page, 400)
  await page.getByLabel('High blood pressure', { exact: true }).check()
  await beat(page, 400)
  await page.getByLabel('Kidney disease', { exact: true }).check()
  await page.getByLabel('Stage (if you know it)').selectOption('3')
  await beat(page, 800)
  await page.getByRole('button', { name: 'Next' }).click()
  await beat(page, 700)
  await page.getByPlaceholder('Search medicines').fill('metformin')
  await page.getByLabel('Metformin', { exact: true }).check()
  await page.getByPlaceholder('Search medicines').fill('telmi')
  await page.getByLabel('Telmisartan', { exact: true }).check()
  await beat(page, 700)
  await page.getByRole('button', { name: 'Next' }).click()
  await beat(page, 600)
  await page.getByLabel(/^Creatinine/).fill('1.4')
  await page.getByLabel(/^Potassium/).fill('5.3')
  await page.getByLabel(/^Top number/).fill('148')
  await page.getByLabel(/^Bottom number/).fill('90')
  await page.getByLabel(/^HbA1c/).fill('8.2')
  await beat(page, 600)

  // The five engine stages light up while the plan is built.
  await page.getByRole('button', { name: 'Save and make my plan' }).click()
  await expect(page).toHaveURL(/today/, { timeout: 120_000 })
  await expect(page.getByRole('heading', { name: "Today's meals" })).toBeVisible()
  await beat(page, 2400)

  // Today: meal cards, limit meters counting up, hover lift, expanding detail.
  await page.mouse.move(420, 420)
  await beat(page, 800)
  await page.mouse.move(1050, 500)
  await beat(page, 900)
  await page.getByRole('button', { name: 'Details' }).first().click()
  await beat(page, 1500)
  await page.getByRole('button', { name: 'Ate it' }).first().click()
  await beat(page, 1400)

  // Week: day tabs re-run the whole day's entrance.
  await page.getByRole('link', { name: 'Week' }).first().click()
  await beat(page, 1600)
  await page.getByRole('tab').nth(2).click()
  await beat(page, 1500)
  await page.getByRole('tab').nth(4).click()
  await beat(page, 1600)

  // Food check: the verdict pops in, alerts stagger.
  await page.getByRole('link', { name: 'Food check' }).first().click()
  await beat(page, 900)
  await page.getByPlaceholder('e.g. idli, rajma, banana').pressSequentially('coconut', { delay: 110 })
  await beat(page, 1200)
  await page.getByRole('button', { name: /Tender coconut water/ }).click()
  await beat(page, 2400)

  // Progress: the adherence ring draws and the number counts up.
  await page.getByRole('link', { name: 'Progress' }).first().click()
  await beat(page, 1200)
  await page.getByLabel('Test').selectOption('weight')
  await page.getByLabel('Value').fill('73.5')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await beat(page, 2000)

  // Language switch keeps every animation intact.
  await page.getByRole('link', { name: 'Today' }).first().click()
  await beat(page, 1200)
  await page.getByRole('button', { name: 'தமிழ்' }).click()
  await beat(page, 2400)
  await page.getByRole('button', { name: 'English' }).click()
  await beat(page, 1600)
})
