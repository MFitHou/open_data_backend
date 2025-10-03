#!/bin/bash

echo "===================================="
echo "   Open Data Backend Setup Script"
echo "===================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}$1${NC}"
}

print_error() {
    echo -e "${RED}$1${NC}"
}

print_warning() {
    echo -e "${YELLOW}$1${NC}"
}

# Check if Node.js is installed
echo "Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    print_error "ERROR: Node.js is not installed!"
    echo "Please install Node.js using one of the following methods:"
    echo ""
    echo "Ubuntu/Debian:"
    echo "  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
    echo "  sudo apt-get install -y nodejs"
    echo ""
    echo "macOS:"
    echo "  brew install node"
    echo "  # or download from https://nodejs.org/"
    echo ""
    echo "Other Linux distributions:"
    echo "  # Download from https://nodejs.org/"
    exit 1
fi

print_success "Node.js version: $(node --version)"

# Check if npm is installed
echo "Checking npm installation..."
if ! command -v npm &> /dev/null; then
    print_error "ERROR: npm is not installed!"
    echo "Please install npm or reinstall Node.js"
    exit 1
fi

print_success "npm version: $(npm --version)"
echo ""

# Install dependencies
echo "Installing dependencies..."
if npm install; then
    print_success "Dependencies installed successfully!"
else
    print_error "ERROR: Failed to install dependencies!"
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    print_warning "Creating .env file..."
    cat > .env << EOF
# Environment Configuration
PORT=3000
NODE_ENV=development

# Add your configuration here
# DATABASE_URL=
# JWT_SECRET=
EOF
    print_success ".env file created with default configuration"
fi

echo ""
print_success "===================================="
print_success "        Setup completed!"
print_success "===================================="
echo ""
echo "You can now run the application with:"
echo "  npm run start:dev    (for development)"
echo "  npm run start        (for production)"
echo ""
echo "Available commands:"
echo "  npm run start:dev    - Development mode with auto-reload"
echo "  npm run start:debug  - Debug mode"
echo "  npm run test         - Run tests"
echo "  npm run build        - Build for production"
echo ""
print_success "Happy coding! 🚀"