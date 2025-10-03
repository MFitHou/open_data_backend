#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}====================================${NC}"
echo -e "${BLUE}    Open Data Backend Runner${NC}"
echo -e "${BLUE}====================================${NC}"
echo ""
echo "Select mode:"
echo -e "${GREEN}1.${NC} Development (recommended)"
echo -e "${GREEN}2.${NC} Production"
echo -e "${GREEN}3.${NC} Debug"
echo -e "${GREEN}4.${NC} Run tests"
echo -e "${RED}5.${NC} Exit"
echo ""
read -p "Enter your choice (1-5): " choice

case $choice in
    1)
        echo -e "${YELLOW}Starting development server...${NC}"
        npm run start:dev
        ;;
    2)
        echo -e "${YELLOW}Building and starting production server...${NC}"
        npm run build && npm run start:prod
        ;;
    3)
        echo -e "${YELLOW}Starting debug server...${NC}"
        npm run start:debug
        ;;
    4)
        echo -e "${YELLOW}Running tests...${NC}"
        npm run test
        ;;
    5)
        echo -e "${GREEN}Goodbye!${NC}"
        exit 0
        ;;
    *)
        echo -e "${RED}Invalid choice. Please try again.${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}Press any key to exit...${NC}"
read -n 1