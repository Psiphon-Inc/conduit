# Conduit App

Conduit InProxy runner targetting iOS and Android

## Git LFS Usage

This project uses Git LFS (Large File Storage) to manage large files such as the tunnel core libraries. Please follow the instructions below to ensure you are set up correctly:

### For All Users

1. **Install Git LFS**:  
   Ensure Git LFS is installed by running:
   ```bash
   git lfs install
   ```

### For Existing Users (Already Cloned the Repository)

1. **Pull LFS-managed files**:  
   If you already have the project cloned, run the following command to pull the latest LFS-tracked files:
   ```bash
   git lfs pull
   ```

### For New Users (Cloning the Repository)

When cloning the repository for the first time, Git LFS will automatically handle the LFS files as part of the clone process:
```bash
git clone <repository-url>
```

### Additional Information

- Git LFS will manage files such as `.aar` libraries, as specified in the `.gitattributes` file.
- Ensure Git LFS is installed to avoid issues with large files.

For more details, visit the [Git LFS documentation](https://git-lfs.github.com/).
