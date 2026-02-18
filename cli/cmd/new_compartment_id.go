package cmd

import (
	"fmt"
	"os"

	"github.com/Psiphon-Inc/conduit/cli/internal/config"
	"github.com/spf13/cobra"
)

var (
	compartmentNameDefault string
	compartmentName        string
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
	}

	rootCmd.AddCommand(newCompartmentIDCmd)
	newCompartmentIDCmd.Flags().StringVarP(&compartmentName, "name", "n", compartmentNameDefault, "display name in share token")
}

func runNewCompartmentID(cmd *cobra.Command, args []string) error {
	dataDir := GetDataDir()

	compartmentID, err := config.GeneratePersonalCompartmentID()
	if err != nil {
		return err
	}

	if err := config.SavePersonalCompartmentID(dataDir, compartmentID); err != nil {
		return err
	}

	shareToken, err := config.BuildPersonalPairingToken(compartmentID, compartmentName)
	if err != nil {
		return err
	}

	fmt.Printf("Saved compartment ID to %s\n", config.PersonalCompartmentFilePath(dataDir))
	fmt.Println("Share token:")
	fmt.Println(shareToken)

	return nil
}
