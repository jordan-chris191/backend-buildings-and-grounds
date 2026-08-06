import { PrismaClient, ItemType, Campus, ItemStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // =========================
  // Roles
  // =========================

  const administrator = await prisma.role.upsert({
    where: { name: 'Administrator' },
    update: {},
    create: { name: 'Administrator' },
  });

  await prisma.role.upsert({
    where: { name: 'Building & Grounds Officer' },
    update: {},
    create: { name: 'Building & Grounds Officer' },
  });

  await prisma.role.upsert({
    where: { name: 'Campus Staff' },
    update: {},
    create: { name: 'Campus Staff' },
  });

  await prisma.role.upsert({
    where: { name: 'Property Custodian' },
    update: {},
    create: { name: 'Property Custodian' },
  });

  await prisma.role.upsert({
    where: { name: 'Faculty' },
    update: {},
    create: { name: 'Faculty' },
  });

  // =========================
  // Default Administrators
  // =========================

  const passwordHash1 = await bcrypt.hash(
    process.env.SEED_ADMIN_PASSWORD ?? 'admin@123',
    10,
  );

  await prisma.user.upsert({
    where: { email: 'jordanchrisangelu@gmail.com' },
    update: {},
    create: {
      email: 'jordanchrisangelu@gmail.com',
      passwordHash: passwordHash1,
      firstName: 'System',
      lastName: 'Administrator',
      roleId: administrator.id,
    },
  });

  const passwordHash2 = await bcrypt.hash('staff@123', 10);

  await prisma.user.upsert({
    where: { email: 'haises667@gmail.com' },
    update: {},
    create: {
      email: 'haises667@gmail.com',
      passwordHash: passwordHash2,
      firstName: 'Staff',
      lastName: 'Administrator',
      roleId: administrator.id,
    },
  });

  // =========================
  // Item Categories
  // =========================

  const categories = [
    { name: 'Electrical Supplies', description: 'Wires, bulbs, switches, and electrical tools' },
    { name: 'Plumbing Materials', description: 'Pipes, fittings, valves, and plumbing equipment' },
    { name: 'Carpentry Tools', description: 'Hammers, saws, nails, and woodwork materials' },
    { name: 'Cleaning Supplies', description: 'Mops, detergents, trash bags, and janitorial items' },
    { name: 'Masonry Materials', description: 'Cement, blocks, gravel, and concrete supplies' },
    { name: 'Painting Supplies', description: 'Brushes, rollers, paint, and surface prep tools' },
    { name: 'General Hardware', description: 'Screws, bolts, tapes, and miscellaneous hardware' },
  ];

  const createdCategories: Record<string, string> = {};

  for (const cat of categories) {
    const record = await prisma.itemCategory.upsert({
      where: { name: cat.name },
      update: {},
      create: cat,
    });
    createdCategories[cat.name] = record.id;
  }

  // =========================
  // Inventory Items (20)
  // =========================

  const items = [
    {
      name: 'LED Bulb 9W',
      type: ItemType.CONSUMABLE,
      campus: Campus.MC1,
      description: 'Energy-saving LED bulb for classroom and office lighting',
      quantity: 24,
      unit: 'PCS',
      location: 'Bodega A - Shelf 1',
      unitCost: 85.0,
      category: 'Electrical Supplies',
      status: ItemStatus.GOOD_CONDITION,
    },
    {
      name: 'PVC Pipe 1/2" (3m length)',
      type: ItemType.CONSUMABLE,
      campus: Campus.MC1,
      description: 'Half-inch PVC pipe for water line repairs',
      quantity: 15,
      unit: 'LENGTH',
      location: 'Bodega A - Shelf 3',
      unitCost: 120.0,
      category: 'Plumbing Materials',
      status: ItemStatus.GOOD_CONDITION,
    },
    {
      name: 'Claw Hammer 16oz',
      type: ItemType.TOOL,
      campus: Campus.MC1,
      description: 'Standard claw hammer for carpentry work',
      quantity: 5,
      unit: 'PCS',
      location: 'Tool Room - Rack 2',
      propertyNumber: 'PROP-2026-0001',
      unitCost: 350.0,
      category: 'Carpentry Tools',
      status: ItemStatus.GOOD_CONDITION,
    },
    {
      name: 'Industrial Floor Mop',
      type: ItemType.CONSUMABLE,
      campus: Campus.MC2,
      description: 'Heavy-duty mop for hallway and lobby cleaning',
      quantity: 10,
      unit: 'PCS',
      location: 'Janitorial Supply Room',
      unitCost: 180.0,
      category: 'Cleaning Supplies',
      status: ItemStatus.GOOD_CONDITION,
    },
    {
      name: 'Portland Cement (40kg)',
      type: ItemType.CONSUMABLE,
      campus: Campus.PAMPLONA,
      description: '40kg bag of Portland cement for masonry repairs',
      quantity: 30,
      unit: 'BAG',
      location: 'Outdoor Storage - Cement Area',
      unitCost: 280.0,
      category: 'Masonry Materials',
      status: ItemStatus.GOOD_CONDITION,
    },
    {
      name: 'Paint Brush 2"',
      type: ItemType.CONSUMABLE,
      campus: Campus.MC1,
      description: 'Two-inch bristle paint brush for wall touch-ups',
      quantity: 18,
      unit: 'PCS',
      location: 'Bodega B - Paint Section',
      unitCost: 45.0,
      category: 'Painting Supplies',
      status: ItemStatus.GOOD_CONDITION,
    },
    {
      name: 'Extension Cord 5m (Heavy Duty)',
      type: ItemType.ASSET,
      campus: Campus.MC2,
      description: '5-meter heavy-duty extension cord with surge protection',
      quantity: 4,
      unit: 'PCS',
      location: 'Electrical Room',
      propertyNumber: 'PROP-2026-0002',
      serialNumber: 'SN-EXT-2026-001',
      unitCost: 650.0,
      category: 'Electrical Supplies',
      status: ItemStatus.GOOD_CONDITION,
    },
    {
      name: 'Adjustable Wrench 10"',
      type: ItemType.TOOL,
      campus: Campus.MC1,
      description: '10-inch adjustable wrench for plumbing maintenance',
      quantity: 3,
      unit: 'PCS',
      location: 'Tool Room - Rack 1',
      propertyNumber: 'PROP-2026-0003',
      unitCost: 420.0,
      category: 'Plumbing Materials',
      status: ItemStatus.BORROWED,
    },
    {
      name: 'Handsaw 18"',
      type: ItemType.TOOL,
      campus: Campus.PAMPLONA,
      description: '18-inch handsaw for wood cutting and fabrication',
      quantity: 4,
      unit: 'PCS',
      location: 'Fabrication Shop',
      propertyNumber: 'PROP-2026-0004',
      unitCost: 550.0,
      category: 'Carpentry Tools',
      status: ItemStatus.GOOD_CONDITION,
    },
    {
      name: 'Garbage Bag (Large, roll of 20)',
      type: ItemType.CONSUMABLE,
      campus: Campus.MC1,
      description: 'Large black garbage bags for campus waste disposal',
      quantity: 12,
      unit: 'ROLL',
      location: 'Janitorial Supply Room',
      unitCost: 95.0,
      category: 'Cleaning Supplies',
      status: ItemStatus.GOOD_CONDITION,
    },
    {
      name: 'Steel Nail (1kg box, 2")',
      type: ItemType.CONSUMABLE,
      campus: Campus.MC2,
      description: 'Two-inch steel nails for carpentry and repairs',
      quantity: 8,
      unit: 'BOX',
      location: 'Bodega A - Shelf 2',
      unitCost: 150.0,
      category: 'Carpentry Tools',
      status: ItemStatus.GOOD_CONDITION,
    },
    {
      name: 'Electrical Tape (PVC, 10m)',
      type: ItemType.CONSUMABLE,
      campus: Campus.PAMPLONA,
      description: 'PVC electrical tape for wire insulation and marking',
      quantity: 20,
      unit: 'ROLL',
      location: 'Bodega A - Shelf 1',
      unitCost: 35.0,
      category: 'Electrical Supplies',
      status: ItemStatus.GOOD_CONDITION,
    },
    {
      name: 'Screwdriver Set (6pcs)',
      type: ItemType.TOOL,
      campus: Campus.MC1,
      description: '6-piece screwdriver set with flat and Phillips heads',
      quantity: 6,
      unit: 'SET',
      location: 'Tool Room - Rack 3',
      propertyNumber: 'PROP-2026-0005',
      unitCost: 480.0,
      category: 'General Hardware',
      status: ItemStatus.GOOD_CONDITION,
    },
    {
      name: 'Water Hose 10m (Heavy Duty)',
      type: ItemType.ASSET,
      campus: Campus.MC2,
      description: '10-meter heavy-duty rubber water hose',
      quantity: 2,
      unit: 'PCS',
      location: 'Plumbing Storage',
      propertyNumber: 'PROP-2026-0006',
      serialNumber: 'SN-HOS-2026-002',
      unitCost: 850.0,
      category: 'Plumbing Materials',
      status: ItemStatus.UNDER_REPAIR,
    },
    {
      name: 'Paint Roller (7")',
      type: ItemType.CONSUMABLE,
      campus: Campus.PAMPLONA,
      description: 'Seven-inch paint roller for wall painting jobs',
      quantity: 14,
      unit: 'PCS',
      location: 'Bodega B - Paint Section',
      unitCost: 65.0,
      category: 'Painting Supplies',
      status: ItemStatus.GOOD_CONDITION,
    },
    {
      name: 'Welding Rod (E6013, box of 5kg)',
      type: ItemType.CONSUMABLE,
      campus: Campus.MC1,
      description: 'E6013 welding electrodes for mild steel fabrication',
      quantity: 6,
      unit: 'BOX',
      location: 'Fabrication Shop',
      unitCost: 520.0,
      category: 'General Hardware',
      status: ItemStatus.GOOD_CONDITION,
    },
    {
      name: 'Aircon Filter (Universal 24x24)',
      type: ItemType.CONSUMABLE,
      campus: Campus.MC2,
      description: 'Universal aircon filter for split-type maintenance',
      quantity: 9,
      unit: 'PCS',
      location: 'Bodega C - HVAC Section',
      unitCost: 220.0,
      category: 'Cleaning Supplies',
      status: ItemStatus.GOOD_CONDITION,
    },
    {
      name: 'Concrete Hollow Block (4")',
      type: ItemType.CONSUMABLE,
      campus: Campus.PAMPLONA,
      description: 'Four-inch concrete hollow block for wall repairs',
      quantity: 100,
      unit: 'PCS',
      location: 'Outdoor Storage - Block Pile',
      unitCost: 18.0,
      category: 'Masonry Materials',
      status: ItemStatus.GOOD_CONDITION,
    },
    {
      name: 'Digital Voltage Tester',
      type: ItemType.TOOL,
      campus: Campus.MC1,
      description: 'Non-contact digital voltage tester for electrical troubleshooting',
      quantity: 3,
      unit: 'PCS',
      location: 'Electrical Room',
      propertyNumber: 'PROP-2026-0007',
      serialNumber: 'SN-VOLT-2026-003',
      unitCost: 750.0,
      category: 'Electrical Supplies',
      status: ItemStatus.GOOD_CONDITION,
    },
    {
      name: 'Putty Knife (3")',
      type: ItemType.TOOL,
      campus: Campus.MC2,
      description: 'Three-inch putty knife for surface preparation and patching',
      quantity: 7,
      unit: 'PCS',
      location: 'Bodega B - Paint Section',
      propertyNumber: 'PROP-2026-0008',
      unitCost: 120.0,
      category: 'Painting Supplies',
      status: ItemStatus.GOOD_CONDITION,
    },
  ];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const categoryId = createdCategories[item.category];

    await prisma.inventoryItem.create({
      data: {
        name: item.name,
        type: item.type,
        campus: item.campus,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        location: item.location,
        propertyNumber: item.propertyNumber ?? null,
        serialNumber: item.serialNumber ?? null,
        unitCost: item.unitCost,
        acquisitionDate: new Date('2026-01-15'),
        categoryId,
        status: item.status,
      },
    });
  }

  console.log('✅ Database seeded successfully!');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });