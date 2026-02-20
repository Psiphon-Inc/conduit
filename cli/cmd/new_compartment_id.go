package cmd

import (
	"fmt"
	"os"
	"strings"
	"unicode/utf8"

	"github.com/Psiphon-Inc/conduit/cli/internal/config"
	"github.com/Psiphon-Inc/conduit/cli/internal/logging"
	"github.com/spf13/cobra"
)

var (
	compartmentNameDefault string
	compartmentName        string
	defaultNameFromHost    bool
)

var newCompartmentIDCmd = &cobra.Command{
	Use:   "new-compartment-id",
	Short: "Create and persist a personal compartment ID",
	Long:  "Generate a personal compartment ID, save it to the data directory, and output a share token.",
	RunE:  runNewCompartmentID,
}

func init() {
	compartmentNameDefault = "conduit"
	if host, err := os.Hostname(); err == nil && host != "" {
		compartmentNameDefault = host
		defaultNameFromHost = true
	}

	rootCmd.AddCommand(newCompartmentIDCmd)
	newCompartmentIDCmd.Flags().StringVarP(&compartmentName, "name", "n", compartmentNameDefault, "display name in share token (max 32 chars)")
}

func runNewCompartmentID(cmd *cobra.Command, args []string) error {
	dataDir := GetDataDir()

	name := strings.TrimSpace(compartmentName)
	nameSetByUser := cmd.Flags().Changed("name")

	if !nameSetByUser && defaultNameFromHost {
		logging.Printf("[INFO] Defaulting --name to hostname %q (use --name to override)\n", name)
	}

	if utf8.RuneCountInString(name) > config.PersonalPairingNameMaxLength {
		return fmt.Errorf("--name must be at most %d characters", config.PersonalPairingNameMaxLength)
	}

	compartmentID, err := config.GeneratePersonalCompartmentID()
	if err != nil {
		return err
	}

	if err := config.SavePersonalCompartmentID(dataDir, compartmentID); err != nil {
		return err
	}

	shareToken, err := config.BuildPersonalPairingToken(compartmentID, name)
	if err != nil {
		return err
	}

	fmt.Printf("Saved compartment ID to %s\n", config.PersonalCompartmentFilePath(dataDir))
	fmt.Println("Share token:")
	fmt.Println(shareToken)

	return nil
}
