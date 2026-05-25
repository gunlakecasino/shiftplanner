# Xcode Project Setup Guide — opsApp (Clean Reset Version)

We had to do a clean reset because the first attempt got messy (this is extremely common when creating Xcode projects over existing folders).

Follow these instructions **exactly** and we will have a clean, professional project.

---

## Step 1: Make Sure We're Starting Clean

Close Xcode completely.

In Finder, go to `/Users/briankillian/oms_root/opsApp/`

You should see something like:
- `opsApp/` (folder with our prepared structure inside)
- `PROJECT_SETUP_GUIDE.md`
- `README.md`
- `.gitignore`

If you see `opsApp.xcodeproj` or another `opsApp` folder at this level, delete them now.

---

## Step 2: Create the Xcode Project (Correct Way)

1. Open Xcode.
2. **File → New → Project**
3. Select **iOS** → **App** → Next
4. Fill in:
   - Product Name: `opsApp`
   - Team: Your team (or None)
   - Organization Identifier: `com.zds` (or whatever you prefer)
   - Interface: **SwiftUI**
   - Language: **Swift**
5. **The Critical Part**:
   - Click the folder icon to choose where to save.
   - Navigate to and **select** the `opsApp` folder (the one that already contains our prepared files and the `opsApp/` subfolder with our code).
   - **Important**: Make sure "Create folder" or similar options are **not** creating an extra nested folder.
   - Uncheck "Create Git repository on my Mac" (we're already in a git repo at the root).

Click Create.

Xcode will generate the `.xcodeproj` at the root of `opsApp/`.

---

## Step 3: Add Our Prepared Files to the Project

This is the part that often gets missed.

After Xcode creates the project:

1. In the Xcode navigator (left side), you will see the default files.
2. Delete the default `ContentView.swift` and `opsAppApp.swift` that Xcode created (right-click → Delete → Move to Trash).
3. Now drag the folders from Finder into Xcode:
   - Drag the entire `App` folder into the project navigator.
   - Drag the entire `Core` folder.
   - Drag the entire `Features` folder.
   - Drag the entire `Utilities` folder.
   - Drag the `Resources` folder.

When dragging, make sure:
- "Create groups" is selected (not "Create folder references")
- The target `opsApp` is checked
- "Copy items if needed" can stay unchecked since the files are already in the right place.

---

## Step 4: Add Supabase Package

1. File → Add Package Dependencies
2. URL: `https://github.com/supabase/supabase-swift`
3. Add the `Supabase` product.

---

## Step 5: Set Up Secrets

1. In Finder, go to `opsApp/opsApp/Resources/`
2. Copy `Secrets.plist.example` → rename to `Secrets.plist`
3. Fill in your actual Supabase URL and keys.

`Secrets.plist` is gitignored.

---

## Step 6: Project Settings

- Select the project → opsApp target
- Minimum iOS: **18.0** (recommended for good Pencil support)
- Devices: iPad only

---

## Step 7: Build

Try building (Cmd+B).

If there are any "file not found" errors, it usually means some folders weren't added properly in Step 3. Just drag them in again.

---

Once it builds and runs, reply and we'll immediately move to building the first real ShiftPlanner canvas with Pencil Pro 2.

---

**If you run into any error at any step, just paste the error here.** We'll fix it together quickly. No stress.